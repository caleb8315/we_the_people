import Link from 'next/link';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/30 px-8 py-16 text-center">
      {icon && <span className="mb-4 text-3xl text-zinc-600">{icon}</span>}
      <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-zinc-500">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 rounded-full bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
