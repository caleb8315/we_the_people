import dynamic from 'next/dynamic';
import type { SignalGeoPoint } from '@/lib/signal-geo';

// The map client and its ~40KB of Leaflet + tile assets are only loaded in
// the browser, the moment the user actually renders the map view. The
// explicit `loading` placeholder prevents a blank black rectangle while the
// chunk is fetched.
const SignalsMapClient = dynamic(
  () => import('./signals-map-client').then((m) => m.SignalsMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-xs text-white/55">
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
  context,
  mapHeightClass = 'h-[52vh] min-h-[360px]',
  emptyMessage,
}: {
  points: SignalGeoPoint[];
  context: 'feed' | 'intel';
  mapHeightClass?: string;
  emptyMessage?: string;
}) {
  const exact = points.filter((p) => !p.isApproximate).length;
  const approximate = points.length - exact;
  const corroborated = points.filter((p) => p.verification_status === 'verified').length;

  if (points.length === 0) {
    return (
      <div className="rounded-card border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
        {emptyMessage ?? 'No map points available for this filter set yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/65">
        <span className="rounded-full border border-white/15 px-2 py-1">{points.length} points</span>
        <span className="rounded-full border border-white/15 px-2 py-1">{exact} exact</span>
        <span className="rounded-full border border-white/15 px-2 py-1">{approximate} approximate</span>
        <span className="rounded-full border border-white/15 px-2 py-1">{corroborated} corroborated</span>
      </div>
      <div className={`overflow-hidden rounded-card border border-white/10 bg-black/20 ${mapHeightClass}`}>
        <SignalsMapClient points={points} context={context} />
      </div>
    </div>
  );
}
