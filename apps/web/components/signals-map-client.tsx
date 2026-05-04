'use client';

// NOTE: Leaflet's default CSS (`leaflet/dist/leaflet.css`) is imported once
// from `apps/web/app/layout.tsx` — the App Router only allows global CSS
// from `node_modules` to be imported from Server Components / the root
// layout, never from a `'use client'` file. Importing it here would
// silently break the production build.
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { statusLabel } from '@osint/core';
import type { ProductEventName } from '@/lib/product-events';
import type { SignalGeoPoint } from '@/lib/signal-geo';

// ── Leaflet loader ────────────────────────────────────────────────────────
// Dynamic-import Leaflet once per browser session. The resolved module is
// cached at module scope so subsequent renders (tab switch, filter change,
// route re-enter) reuse it without re-parsing ~40KB of JS.
let leafletModulePromise: Promise<typeof Leaflet> | null = null;
function loadLeaflet(): Promise<typeof Leaflet> {
  if (typeof window === 'undefined') {
    // Should never happen — this file is client-only — but fail safely.
    return Promise.reject(new Error('Leaflet can only be loaded in the browser'));
  }
  if (!leafletModulePromise) {
    leafletModulePromise = import('leaflet').then((m) => (m.default ?? m) as typeof Leaflet);
  }
  return leafletModulePromise;
}

// ── Visual helpers ────────────────────────────────────────────────────────

function pinColor(severity: number): string {
  if (severity >= 85) return '#ef4444';
  if (severity >= 70) return '#f59e0b';
  return '#10b981';
}

function pressureColor(priority: number): string {
  if (priority >= 85) return '#dc2626';
  if (priority >= 70) return '#f97316';
  return '#eab308';
}

function badgeTone(status: SignalGeoPoint['verification_status']) {
  if (status === 'verified') return 'border-brand-200 text-brand-700';
  if (status === 'developing') return 'border-amber-200 text-amber-700';
  return 'border-ink-200 text-ink-600';
}

function markerIcon(L: typeof Leaflet, color: string) {
  return L.divIcon({
    className: 'osint-map-pin',
    html: `<span style="display:inline-block;width:14px;height:14px;border-radius:999px;background:${color};border:2px solid #0b0d12;box-shadow:0 0 0 1px rgba(255,255,255,.25)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

function pressureMarkerIcon(L: typeof Leaflet, color: string, isApproximate: boolean) {
  const borderStyle = isApproximate ? '2px dashed #111827' : '2px solid #111827';
  return L.divIcon({
    className: 'osint-map-pressure-pin',
    html: `<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${color};border:${borderStyle};box-shadow:0 0 0 1px rgba(255,255,255,.25)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

function clusterIcon(L: typeof Leaflet, count: number, worstSeverity: number) {
  const color = pinColor(worstSeverity);
  const size = count >= 12 ? 34 : count >= 5 ? 30 : 26;
  return L.divIcon({
    className: 'osint-map-cluster',
    html: `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;background:${color};color:white;border:2px solid #0b0d12;font-weight:700;font-size:11px;box-shadow:0 0 0 1px rgba(255,255,255,.25)">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -8],
  });
}

async function fireEvent(eventName: ProductEventName, eventProps: Record<string, unknown>) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_name: eventName, event_props: eventProps }),
    });
  } catch {
    // best effort telemetry
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sourceClassLabel(cls: SignalGeoPoint['source_class']): string {
  switch (cls) {
    case 'sensor':
      return 'Sensor';
    case 'news':
      return 'News';
    case 'social':
      return 'Social';
    case 'markets':
      return 'Market';
    case 'official':
      return 'Official';
    case 'other':
    default:
      return 'Other';
  }
}

function sourceClassTone(cls: SignalGeoPoint['source_class']): string {
  switch (cls) {
    case 'sensor':
      return 'border-sky-200 text-sky-700';
    case 'news':
      return 'border-emerald-200 text-emerald-700';
    case 'social':
      return 'border-violet-200 text-violet-700';
    case 'markets':
      return 'border-amber-200 text-amber-700';
    case 'official':
      return 'border-indigo-200 text-indigo-700';
    case 'other':
    default:
      return 'border-ink-200 text-ink-600';
  }
}

function clusterKey(point: SignalGeoPoint): string {
  // Approximate ~11km buckets to collapse colocated points without
  // erasing regional distinctions.
  const latBucket = Math.round(point.lat * 10) / 10;
  const lonBucket = Math.round(point.lon * 10) / 10;
  return `${latBucket.toFixed(1)},${lonBucket.toFixed(1)}`;
}

interface ClusterBucket {
  lat: number;
  lon: number;
  points: SignalGeoPoint[];
}

function buildClusters(points: SignalGeoPoint[]): ClusterBucket[] {
  const grouped = new Map<string, ClusterBucket>();
  for (const p of points) {
    const key = clusterKey(p);
    const existing = grouped.get(key);
    if (existing) {
      existing.points.push(p);
      continue;
    }
    grouped.set(key, {
      lat: p.lat,
      lon: p.lon,
      points: [p],
    });
  }
  return [...grouped.values()];
}

// ── Component ─────────────────────────────────────────────────────────────

export function SignalsMapClient({
  points,
  pressurePoints = [],
  allPointsCount,
  context,
}: {
  points: SignalGeoPoint[];
  pressurePoints?: SignalGeoPoint[];
  allPointsCount: number;
  context: 'feed' | 'intel';
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);

  // Track leaflet-loaded state so we can render a skeleton while the chunk
  // is fetched on first use. Also track any load error so the UI can
  // surface a retry hint instead of staying blank.
  const [leafletReady, setLeafletReady] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const combinedPoints = useMemo(() => [...points, ...pressurePoints], [points, pressurePoints]);
  const exactCount = useMemo(() => combinedPoints.filter((p) => !p.isApproximate).length, [combinedPoints]);
  const approxCount = combinedPoints.length - exactCount;
  const corroboratedCount = useMemo(
    () => points.filter((p) => p.verification_status === 'verified').length,
    [points],
  );
  const clusters = useMemo(() => buildClusters(points), [points]);
  const stackedClusters = useMemo(() => clusters.filter((c) => c.points.length > 1).length, [clusters]);
  const pressureClusters = useMemo(() => buildClusters(pressurePoints), [pressurePoints]);

  // Step 1 — initialize the Leaflet map once the dynamic import resolves.
  // Cleanup disposes the map so route-changes and Hot Reload don't leak
  // DOM nodes or listeners.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        if (!mapElementRef.current || mapRef.current) {
          setLeafletReady(true);
          return;
        }
        const map = L.map(mapElementRef.current, {
          worldCopyJump: true,
          minZoom: 2,
          preferCanvas: true, // faster marker rendering for dozens of points
          zoomControl: true,
        });
        map.setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
          // Stay within the browser's default tile cache by not disabling
          // keepBuffer; use a moderate buffer to prefetch tiles just off
          // screen so panning feels instant.
          keepBuffer: 2,
        }).addTo(map);
        const layer = L.layerGroup().addTo(map);
        mapRef.current = map;
        markerLayerRef.current = layer;
        setLeafletReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[map] leaflet failed to load', err);
        setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
    // Intentionally empty: map init runs once per component mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2 — populate markers when either leaflet finishes loading OR the
  // `points` prop changes. Uses the cached module reference so there's no
  // second network fetch after the first render.
  useEffect(() => {
    if (!leafletReady || !leafletModulePromise) return;
    // The promise is already settled once `leafletReady` is true, so this
    // .then chain executes in the same microtask with no network wait.
    leafletModulePromise.then((Lmod) => {
      const map = mapRef.current;
      const layer = markerLayerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();
      if (points.length === 0 && pressurePoints.length === 0) return;

      const bounds = Lmod.latLngBounds([]);
      for (const cluster of clusters) {
        const sorted = [...cluster.points].sort((a, b) => {
          if (b.severity !== a.severity) return b.severity - a.severity;
          return b.source_count - a.source_count;
        });
        const primary = sorted[0]!;
        const icon =
          cluster.points.length > 1
            ? clusterIcon(
                Lmod,
                cluster.points.length,
                sorted.reduce((m, p) => (p.severity > m ? p.severity : m), primary.severity),
              )
            : markerIcon(Lmod, pinColor(primary.severity));
        const marker = Lmod.marker([cluster.lat, cluster.lon], { icon });
        const popupRoot = document.createElement('div');
        popupRoot.className = 'min-w-[240px] max-w-[300px] space-y-2 text-sm';

        const timeAgo = primary.occurred_at ? formatTimeAgo(primary.occurred_at) : null;
        const sourceLine = primary.source_count > 0
          ? `${primary.source_count} source${primary.source_count === 1 ? '' : 's'}${primary.credible_source_count > 0 ? ` (${primary.credible_source_count} rated)` : ''}`
          : '';

        if (cluster.points.length > 1) {
          const listRows = sorted
            .slice(0, 5)
            .map(
              (p) => `<li style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                <a href="/signal/${encodeURIComponent(p.id)}?from=map&context=${context}" style="font-weight:500;color:#111827;text-decoration:none;display:block;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.title)}</a>
                <span style="font-size:11px;color:#6b7280;white-space:nowrap">${p.severity}/100</span>
              </li>`,
            )
            .join('');
          popupRoot.innerHTML = `
          <div class="flex flex-wrap items-center gap-1">
            <span class="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-700">${cluster.points.length} signals</span>
            <span class="rounded-full border px-2 py-0.5 text-[11px] font-medium ${sourceClassTone(primary.source_class)}">${sourceClassLabel(primary.source_class)}</span>
          </div>
          <p class="font-semibold leading-snug text-ink-900" style="line-height:1.35">Cluster at this location</p>
          <ul style="margin:0;padding-left:0;list-style:none;display:grid;gap:6px">${listRows}</ul>
          ${cluster.points.length > 5 ? `<p class="text-xs text-ink-500">+${cluster.points.length - 5} more in this cluster</p>` : ''}
          `;
        } else {
          popupRoot.innerHTML = `
          <div class="flex flex-wrap items-center gap-1">
            <span class="rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeTone(primary.verification_status)}">${escapeHtml(statusLabel(primary.verification_status))}</span>
            <span class="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] text-ink-600">${primary.severity}/100</span>
            <span class="rounded-full border px-2 py-0.5 text-[11px] font-medium ${sourceClassTone(primary.source_class)}">${sourceClassLabel(primary.source_class)}</span>
            ${primary.isApproximate ? '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">approx location</span>' : ''}
          </div>
          <p class="font-semibold leading-snug text-ink-900" style="line-height:1.35">${escapeHtml(primary.title)}</p>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500">
            <span class="capitalize">${escapeHtml(primary.topic ?? 'other')}</span>
            ${primary.country_code ? `<span>· ${escapeHtml(primary.country_code)}</span>` : ''}
            ${timeAgo ? `<span>· ${escapeHtml(timeAgo)}</span>` : ''}
          </div>
          ${sourceLine ? `<p class="text-xs text-ink-600">${escapeHtml(sourceLine)}</p>` : ''}
        `;
        }
        const link = document.createElement('a');
        link.href = `/signal/${primary.id}?from=map&context=${context}`;
        link.className =
          'inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700 transition';
        link.textContent = cluster.points.length > 1 ? 'Open top signal →' : 'View full event →';
        link.addEventListener('click', () => {
          void fireEvent('signal_opened_from_map', {
            signal_id: primary.id,
            context,
            severity: primary.severity,
            is_approximate: primary.isApproximate,
            source_class: primary.source_class,
            cluster_size: cluster.points.length,
          });
        });
        popupRoot.appendChild(link);
        marker.bindPopup(popupRoot, { maxWidth: 320 });
        marker.addTo(layer);
        bounds.extend([cluster.lat, cluster.lon]);
      }
      for (const cluster of pressureClusters) {
        const sorted = [...cluster.points].sort((a, b) => {
          if (b.severity !== a.severity) return b.severity - a.severity;
          return Date.parse(b.first_seen_at ?? '') - Date.parse(a.first_seen_at ?? '');
        });
        const primary = sorted[0]!;
        const icon =
          cluster.points.length > 1
            ? clusterIcon(
                Lmod,
                cluster.points.length,
                sorted.reduce((m, p) => (p.severity > m ? p.severity : m), primary.severity),
              )
            : pressureMarkerIcon(Lmod, pressureColor(primary.severity), primary.isApproximate);
        const marker = Lmod.marker([cluster.lat, cluster.lon], { icon });
        const popupRoot = document.createElement('div');
        popupRoot.className = 'min-w-[240px] max-w-[300px] space-y-2 text-sm';
        if (cluster.points.length > 1) {
          const listRows = sorted
            .slice(0, 5)
            .map(
              (p) => `<li style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                <a href="/signal/${encodeURIComponent(p.id)}?from=map&context=${context}" style="font-weight:500;color:#111827;text-decoration:none;display:block;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.title)}</a>
                <span style="font-size:11px;color:#6b7280;white-space:nowrap">${p.severity}/100</span>
              </li>`,
            )
            .join('');
          popupRoot.innerHTML = `
          <div class="flex flex-wrap items-center gap-1">
            <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Corroboration pressure</span>
            <span class="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-700">${cluster.points.length} hidden single-source</span>
          </div>
          <p class="font-semibold leading-snug text-ink-900" style="line-height:1.35">Coverage is thin here</p>
          <ul style="margin:0;padding-left:0;list-style:none;display:grid;gap:6px">${listRows}</ul>
          ${cluster.points.length > 5 ? `<p class="text-xs text-ink-500">+${cluster.points.length - 5} more in this hotspot</p>` : ''}
          <p class="text-xs text-ink-600">These are queued for automatic multi-source enrichment.</p>
          `;
        } else {
          popupRoot.innerHTML = `
          <div class="flex flex-wrap items-center gap-1">
            <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Corroboration pressure</span>
            <span class="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] text-ink-600">${primary.severity}/100</span>
            ${primary.isApproximate ? '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">approx location</span>' : ''}
          </div>
          <p class="font-semibold leading-snug text-ink-900" style="line-height:1.35">${escapeHtml(primary.title)}</p>
          <p class="text-xs text-ink-600">Single-source story hidden from corroborated map view and queued for automatic source expansion.</p>
          `;
        }
        const link = document.createElement('a');
        link.href = `/signal/${primary.id}?from=map&context=${context}`;
        link.className =
          'inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition';
        link.textContent = 'Review signal →';
        popupRoot.appendChild(link);
        marker.bindPopup(popupRoot, { maxWidth: 320 });
        marker.addTo(layer);
        bounds.extend([cluster.lat, cluster.lon]);
      }
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2), { animate: false, maxZoom: 8 });
      }
      void fireEvent('map_filter_changed', {
        context,
        points: combinedPoints.length,
        total_points: allPointsCount,
        exact_points: exactCount,
        approximate_points: approxCount,
        corroborated_points: corroboratedCount,
        stacked_clusters: stackedClusters,
        pressure_points: pressurePoints.length,
      });
    });
  }, [
    allPointsCount,
    approxCount,
    clusters,
    context,
    corroboratedCount,
    exactCount,
    leafletReady,
    combinedPoints,
    points,
    pressurePoints,
    pressureClusters,
    stackedClusters,
  ]);

  // Always render the map container so Leaflet sees a sized element the
  // moment its import resolves. The overlay is stacked on top and fades
  // out when `leafletReady` flips. An error state replaces the overlay if
  // the dynamic import failed entirely (e.g. offline, CSP block).
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-2 right-2 top-2 z-[500] flex flex-wrap items-center gap-1.5 rounded-xl border border-ink-100/80 bg-paper/95 p-2 text-[11px] shadow-sm backdrop-blur">
        <span className="rounded-full border border-ink-100 px-2 py-1 text-[10px] text-ink-500">
          {combinedPoints.length} shown · {allPointsCount} total
        </span>
        <span className="rounded-full border border-ink-100 px-2 py-1 text-[10px] text-ink-500">
          {stackedClusters} stacked
        </span>
        {pressurePoints.length > 0 && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
            {pressurePoints.length} pressure
          </span>
        )}
      </div>
      <div ref={mapElementRef} className="h-full w-full pt-12" aria-busy={!leafletReady} />
      {!leafletReady && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-ink-600">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500"
            />
            Loading map tiles…
          </span>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 p-4 text-center text-xs text-ink-600">
          <span>Map couldn&apos;t load.</span>
          <span className="text-ink-500">{loadError}</span>
          <button
            type="button"
            onClick={() => {
              leafletModulePromise = null;
              setLoadError(null);
              setLeafletReady(false);
              // Trigger the mount effect by forcing a reload of this
              // component — the simplest reliable path is a full reload.
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="rounded-full border border-ink-200 px-3 py-1 text-[11px] hover:bg-ink-100"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
