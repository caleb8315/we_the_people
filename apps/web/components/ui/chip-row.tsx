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
          const cls = `shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition ${
            isActive
              ? 'border-ink-900 bg-ink-900 text-white shadow-sm'
              : 'border-ink-100 bg-paper text-ink-500 hover:border-ink-200 hover:text-ink'
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
          className="shrink-0 rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs text-ink-500 hover:text-ink"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
