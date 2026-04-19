import Link from 'next/link';

export interface ChipOption {
  label: string;
  value: string;
  href?: string;
}

export function ChipRow({
  options,
  active,
  onSelect,
  onClear,
  clearLabel = 'Clear',
  className = '',
}: {
  options: ChipOption[];
  active: string;
  onSelect?: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="no-scrollbar flex flex-1 items-center gap-2 overflow-x-auto">
        {options.map((opt) => {
          const isActive = opt.value === active;
          const cls = `shrink-0 rounded-full border px-3 py-1 text-xs capitalize transition ${
            isActive
              ? 'border-brand-500/40 bg-brand-500/15 text-brand-200'
              : 'border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white'
          }`;
          if (opt.href) {
            return (
              <Link key={opt.value} href={opt.href} className={cls}>
                {opt.label}
              </Link>
            );
          }
          return (
            <button key={opt.value} type="button" onClick={() => onSelect?.(opt.value)} className={cls}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {onClear && active && active !== 'all' && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 hover:text-white"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
