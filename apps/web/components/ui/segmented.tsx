import Link from 'next/link';

export interface SegmentedOption {
  label: string;
  value: string;
  href?: string;
}

export function Segmented({
  options,
  active,
  onSelect,
  ariaLabel,
  className = '',
}: {
  options: SegmentedOption[];
  active: string;
  onSelect?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role={onSelect ? 'tablist' : undefined}
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-full border border-ink-100 bg-paper p-1 text-sm shadow-sm ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === active;
        const cls = `rounded-full px-3 py-1.5 text-sm font-medium transition ${
          isActive
            ? 'bg-ink-900 text-white shadow-sm'
            : 'text-ink-500 hover:text-ink'
        }`;
        if (opt.href) {
          return (
            <Link
              key={opt.value}
              href={opt.href}
              aria-current={isActive ? 'page' : undefined}
              className={cls}
            >
              {opt.label}
            </Link>
          );
        }
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect?.(opt.value)}
            className={cls}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
