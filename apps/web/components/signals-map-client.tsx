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

// ── Component ─────────────────────────────────────────────────────────────

export function SignalsMapClient({
  points,
  context,
}: {
  points: SignalGeoPoint[];
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

  const exactCount = useMemo(() => points.filter((p) => !p.isApproximate).length, [points]);
  const approxCount = points.length - exactCount;

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
      if (points.length === 0) return;

      const bounds = Lmod.latLngBounds([]);
      for (const point of points) {
        const icon = markerIcon(Lmod, pinColor(point.severity));
        const marker = Lmod.marker([point.lat, point.lon], { icon });
        const popupRoot = document.createElement('div');
        popupRoot.className = 'min-w-[220px] space-y-2 text-sm';
        popupRoot.innerHTML = `
          <div class="flex flex-wrap items-center gap-1">
            <span class="rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(point.verification_status)}">${escapeHtml(statusLabel(point.verification_status))}</span>
            <span class="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] text-ink-600">severity ${point.severity}</span>
            ${
              point.isApproximate
                ? '<span class="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] text-ink-500">approx</span>'
                : ''
            }
          </div>
          <p class="font-medium leading-snug">${escapeHtml(point.title)}</p>
          <p class="text-xs text-ink-500">${escapeHtml(point.topic ?? 'other')}${point.country_code ? ` · ${escapeHtml(point.country_code)}` : ''}</p>
        `;
        const link = document.createElement('a');
        link.href = `/signal/${point.id}?from=map&context=${context}`;
        link.className =
          'inline-block rounded-full border border-ink-200 px-3 py-1 text-xs hover:bg-ink-100';
        link.textContent = 'Open signal';
        link.addEventListener('click', () => {
          void fireEvent('signal_opened_from_map', {
            signal_id: point.id,
            context,
            severity: point.severity,
            is_approximate: point.isApproximate,
          });
        });
        popupRoot.appendChild(link);
        marker.bindPopup(popupRoot);
        marker.addTo(layer);
        bounds.extend([point.lat, point.lon]);
      }
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2), { animate: false, maxZoom: 8 });
      }
      void fireEvent('map_filter_changed', {
        context,
        points: points.length,
        exact_points: exactCount,
        approximate_points: approxCount,
      });
    });
  }, [approxCount, context, exactCount, leafletReady, points]);

  // Always render the map container so Leaflet sees a sized element the
  // moment its import resolves. The overlay is stacked on top and fades
  // out when `leafletReady` flips. An error state replaces the overlay if
  // the dynamic import failed entirely (e.g. offline, CSP block).
  return (
    <div className="relative h-full w-full">
      <div ref={mapElementRef} className="h-full w-full" aria-busy={!leafletReady} />
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
