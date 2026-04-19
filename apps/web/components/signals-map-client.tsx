'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ProductEventName } from '@/lib/product-events';
import type { SignalGeoPoint } from '@/lib/signal-geo';

function pinColor(severity: number): string {
  if (severity >= 85) return '#ef4444';
  if (severity >= 70) return '#f59e0b';
  return '#10b981';
}

function badgeTone(status: SignalGeoPoint['verification_status']) {
  if (status === 'verified') return 'border-brand-500/40 text-brand-200';
  if (status === 'developing') return 'border-warn-500/40 text-warn-400';
  return 'border-white/20 text-white/70';
}

function markerIcon(color: string) {
  if (typeof window === 'undefined') return null;
  const L = getLeaflet();
  if (!L) return null;
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

export function SignalsMapClient({
  points,
  context,
}: {
  points: SignalGeoPoint[];
  context: 'feed' | 'intel';
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markerLayerRef = useRef<any | null>(null);
  const exactCount = useMemo(() => points.filter((p) => !p.isApproximate).length, [points]);
  const approxCount = points.length - exactCount;

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    const L = getLeaflet();
    if (!L) return;
    const map = L.map(mapElementRef.current, { worldCopyJump: true, minZoom: 2 });
    map.setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markerLayerRef.current = layer;
    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = getLeaflet();
    if (!L || !points.length || !mapRef.current || !markerLayerRef.current) return;
    markerLayerRef.current.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const point of points) {
      const icon = markerIcon(pinColor(point.severity));
      if (!icon) continue;
      const marker = L.marker([point.lat, point.lon], { icon });
      const popupRoot = document.createElement('div');
      popupRoot.className = 'min-w-[220px] space-y-2 text-sm';
      popupRoot.innerHTML = `
        <div class="flex flex-wrap items-center gap-1">
          <span class="rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(point.verification_status)}">${point.verification_status}</span>
          <span class="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/75">severity ${point.severity}</span>
          ${
            point.isApproximate
              ? '<span class="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/60">approx</span>'
              : ''
          }
        </div>
        <p class="font-medium leading-snug">${escapeHtml(point.title)}</p>
        <p class="text-xs text-white/60">${escapeHtml(point.topic ?? 'other')}${point.country_code ? ` · ${escapeHtml(point.country_code)}` : ''}</p>
      `;
      const link = document.createElement('a');
      link.href = `/signal/${point.id}?from=map&context=${context}`;
      link.className =
        'inline-block rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10';
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
      marker.addTo(markerLayerRef.current);
      bounds.extend([point.lat, point.lon]);
    }
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds.pad(0.2), { animate: false, maxZoom: 8 });
    }
    void fireEvent('map_filter_changed', {
      context,
      points: points.length,
      exact_points: exactCount,
      approximate_points: approxCount,
    });
  }, [approxCount, context, exactCount, points]);

  return <div ref={mapElementRef} className="h-full w-full" />;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getLeaflet(): typeof import('leaflet') | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('leaflet') as typeof import('leaflet');
}
