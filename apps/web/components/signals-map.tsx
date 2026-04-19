import dynamic from 'next/dynamic';
import type { SignalGeoPoint } from '@/lib/signal-geo';

const SignalsMapClient = dynamic(() => import('./signals-map-client').then((m) => m.SignalsMapClient), {
  ssr: false,
});

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
  const verified = points.filter((p) => p.verification_status === 'verified').length;

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
        <span className="rounded-full border border-white/15 px-2 py-1">{verified} verified</span>
      </div>
      <div className={`overflow-hidden rounded-card border border-white/10 bg-black/20 ${mapHeightClass}`}>
        <SignalsMapClient points={points} context={context} />
      </div>
    </div>
  );
}
