'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { MapSourceClass, SignalGeoPoint } from '@/lib/signal-geo';

// The map client and its ~40KB of Leaflet + tile assets are only loaded in
// the browser, the moment the user actually renders the map view. The
// explicit `loading` placeholder prevents a blank black rectangle while the
// chunk is fetched.
const SignalsMapClient = dynamic(
  () => import('./signals-map-client').then((m) => m.SignalsMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-xs text-ink-500">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500"
          />
          Loading map…
        </span>
      </div>
    ),
  },
);

export function SignalsMap({
  points,
  pressurePoints = [],
  context,
  mapHeightClass = 'h-[52vh] min-h-[360px]',
  emptyMessage,
}: {
  points: SignalGeoPoint[];
  pressurePoints?: SignalGeoPoint[];
  context: 'feed' | 'intel';
  mapHeightClass?: string;
  emptyMessage?: string;
}) {
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'developing' | 'unverified'>('all');
  const [precisionFilter, setPrecisionFilter] = useState<'all' | 'exact' | 'approximate'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | MapSourceClass>('all');
  const [layerFilter, setLayerFilter] = useState<'corroborated' | 'pressure' | 'both'>('both');

  const hasPressure = pressurePoints.length > 0;

  const filteredCorroboratedPoints = useMemo(
    () => {
      const base = points.filter((p) => Number(p.source_count ?? 0) >= 2);
      return base.filter((p) => {
        if (verificationFilter !== 'all' && p.verification_status !== verificationFilter) return false;
        if (precisionFilter === 'exact' && p.isApproximate) return false;
        if (precisionFilter === 'approximate' && !p.isApproximate) return false;
        if (sourceFilter !== 'all' && p.source_class !== sourceFilter) return false;
        return true;
      });
    },
    [points, precisionFilter, sourceFilter, verificationFilter],
  );
  const filteredPressurePoints = useMemo(
    () => {
      if (!hasPressure) return [] as SignalGeoPoint[];
      return pressurePoints.filter((p) => {
        if (verificationFilter !== 'all' && p.verification_status !== verificationFilter) return false;
        if (precisionFilter === 'exact' && p.isApproximate) return false;
        if (precisionFilter === 'approximate' && !p.isApproximate) return false;
        if (sourceFilter !== 'all' && p.source_class !== sourceFilter) return false;
        return true;
      });
    },
    [hasPressure, pressurePoints, precisionFilter, sourceFilter, verificationFilter],
  );

  const mapPrimaryPoints =
    layerFilter === 'corroborated'
      ? filteredCorroboratedPoints
      : layerFilter === 'pressure'
        ? []
        : filteredCorroboratedPoints;
  const mapPressurePoints =
    layerFilter === 'corroborated'
      ? []
      : layerFilter === 'pressure'
        ? filteredPressurePoints
        : filteredPressurePoints;
  const filtered = [...mapPrimaryPoints, ...mapPressurePoints];

  const filteredExact = filtered.filter((p) => !p.isApproximate).length;
  const filteredApprox = filtered.length - filteredExact;
  const filteredVerifiedCount = mapPrimaryPoints.filter((p) => p.verification_status === 'verified').length;
  const filteredPressureCount = mapPressurePoints.length;
  const corroboratedTotal = points.filter((p) => Number(p.source_count ?? 0) >= 2).length;
  const hiddenSingleSourceTotal = pressurePoints.length;

  if (points.length === 0 && pressurePoints.length === 0) {
    return (
      <div className="rounded-card border border-ink-100 bg-paper p-5 text-sm text-ink-500">
        {emptyMessage ?? 'No map points available for this filter set yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
        <span className="rounded-full border border-ink-100 px-2 py-1">
          {filtered.length} shown · {corroboratedTotal + hiddenSingleSourceTotal} total
        </span>
        <span className="rounded-full border border-ink-100 px-2 py-1">{filteredExact} exact</span>
        <span className="rounded-full border border-ink-100 px-2 py-1">{filteredApprox} approximate</span>
        <span className="rounded-full border border-ink-100 px-2 py-1">
          {filteredVerifiedCount} corroborated
        </span>
        {hasPressure && (
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700">
            {filteredPressureCount} pressure hotspot
            {filteredPressureCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="grid gap-2 rounded-card border border-ink-100 bg-paper p-2.5 text-xs sm:grid-cols-4 sm:gap-3 sm:p-3">
        <FilterGroup
          label="Layer"
          value={layerFilter}
          onChange={(value) => setLayerFilter(value as 'corroborated' | 'pressure' | 'both')}
          options={[
            { value: 'both', label: 'Corroborated + Pressure' },
            { value: 'corroborated', label: 'Corroborated only' },
            { value: 'pressure', label: 'Pressure hotspots' },
          ]}
        />
        <FilterGroup
          label="Verification"
          value={verificationFilter}
          onChange={(value) => setVerificationFilter(value as 'all' | 'verified' | 'developing' | 'unverified')}
          options={[
            { value: 'all', label: 'All' },
            { value: 'verified', label: 'Verified' },
            { value: 'developing', label: 'Developing' },
            { value: 'unverified', label: 'Unverified' },
          ]}
        />
        <FilterGroup
          label="Precision"
          value={precisionFilter}
          onChange={(value) => setPrecisionFilter(value as 'all' | 'exact' | 'approximate')}
          options={[
            { value: 'all', label: 'All' },
            { value: 'exact', label: 'Exact' },
            { value: 'approximate', label: 'Approximate' },
          ]}
        />
        <FilterGroup
          label="Source class"
          value={sourceFilter}
          onChange={(value) => setSourceFilter(value as 'all' | MapSourceClass)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'sensor', label: 'Sensor' },
            { value: 'news', label: 'News' },
            { value: 'social', label: 'Social' },
            { value: 'markets', label: 'Markets' },
            { value: 'official', label: 'Official' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </div>
      {hasPressure && (
        <p className="rounded-card border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
          Pressure hotspots mark hidden single-source stories waiting for corroboration. Auto-search runs in
          the background to upgrade these first.
        </p>
      )}
      <div className={`overflow-hidden rounded-card border border-ink-100 bg-black/20 ${mapHeightClass}`}>
        <SignalsMapClient
          points={mapPrimaryPoints}
          pressurePoints={mapPressurePoints}
          allPointsCount={corroboratedTotal + hiddenSingleSourceTotal}
          context={context}
        />
      </div>
      {filtered.length === 0 && (
        <div className="rounded-card border border-ink-100 bg-paper p-3 text-xs text-ink-500">
          No points match current filters. Broaden layer, verification, precision, or source class filters.
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-ink-100 bg-paper px-2.5 py-1.5 text-xs text-ink-700 focus:border-amber-400 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
