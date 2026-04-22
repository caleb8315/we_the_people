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
    clamped >= 85
      ? 'bg-danger-500'
      : clamped >= 65
        ? 'bg-warn-500'
        : clamped >= 40
          ? 'bg-brand-500'
          : 'bg-ink-300';
  const height = size === 'sm' ? 'h-1' : 'h-1.5';
  const width = size === 'sm' ? 'w-14' : 'w-20';
  return (
    <div className="flex items-center gap-2" aria-label={`Severity ${clamped} out of 100`}>
      <div className={`${width} ${height} overflow-hidden rounded-full bg-ink-100`}>
        <div className={`${height} ${tone} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-ink-500">{clamped}</span>
      {label && <span className="text-[11px] text-ink-400">{label}</span>}
    </div>
  );
}
