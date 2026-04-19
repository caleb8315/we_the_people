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
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === active;
        const cls = `rounded-full px-3 py-1.5 text-sm transition ${
          isActive
            ? 'bg-white text-black font-medium shadow-sm'
            : 'text-white/70 hover:text-white'
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
