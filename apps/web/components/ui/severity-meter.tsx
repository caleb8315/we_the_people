export function SeverityMeter({
  severity,
  label,
  size = 'md',
}: {
  severity: number;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(severity ?? 0)));
  const tone =
    clamped >= 85 ? 'bg-danger-500' : clamped >= 65 ? 'bg-warn-500' : clamped >= 40 ? 'bg-brand-500' : 'bg-white/40';
  const height = size === 'sm' ? 'h-1' : 'h-1.5';
  const width = size === 'sm' ? 'w-14' : 'w-20';
  return (
    <div className="flex items-center gap-2" aria-label={`Severity ${clamped} out of 100`}>
      <div className={`${width} ${height} rounded-full bg-white/10 overflow-hidden`}>
        <div className={`${height} ${tone} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-white/70 tabular-nums">{clamped}</span>
      {label && <span className="text-[11px] text-white/50">{label}</span>}
    </div>
  );
}
