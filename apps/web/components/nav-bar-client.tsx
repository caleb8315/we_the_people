'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './signout-button';
import { PlayerStatus } from './player-status';

/**
 * People-first nav — brand mark + live progress chip + desktop links.
 */

export function NavBarClient({
  signedIn,
  displayName,
}: {
  signedIn: boolean;
  displayName: string | null;
}) {
  const pathname = usePathname();
  const hideCompactProgress = pathname === '/';

  const links = [
    { href: '/feed', label: 'Feed' },
    { href: '/verify', label: 'Verify' },
    { href: '/briefings', label: 'Briefings' },
    ...(signedIn ? [{ href: '/notifications', label: 'Alerts' }] : []),
    ...(signedIn ? [{ href: '/dashboard', label: 'HQ' }] : []),
  ];

  const greeting = signedIn && displayName ? `Hey, ${displayName}` : null;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2.5 sm:gap-5 sm:px-6 sm:py-3.5">
        <Link href="/" className="group flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-signal text-base font-bold text-white shadow-sm"
          >
            ✓
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            {greeting && (
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
                {greeting}
              </span>
            )}
            <span className="font-display text-sm font-semibold text-ink">Crosscheck</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-col leading-tight sm:hidden">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
            {greeting ?? 'Crosscheck'}
          </span>
          <span className="truncate font-display text-[12px] font-semibold text-ink">
            For the people
          </span>
        </div>

        <nav className="ml-auto hidden items-center gap-1 rounded-2xl border border-ink-100 bg-paper/80 p-1 shadow-sm md:flex">
          {links.map((l) => {
            const isActive = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-xl px-3.5 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-ink-900 text-white shadow-sm'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0 md:gap-2">
          {!hideCompactProgress && (
            <div className="hidden w-52 lg:block">
              <PlayerStatus compact />
            </div>
          )}
          {signedIn ? (
            <>
              <Link
                href="/settings"
                aria-label="Account settings"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink-100 bg-paper text-ink-500 hover:border-ink-200 hover:text-ink"
              >
                <span className="text-sm font-semibold">
                  {(displayName ?? '?').slice(0, 1).toUpperCase()}
                </span>
              </Link>
              <span className="hidden md:inline">
                <SignOutButton />
              </span>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-xl bg-ink-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
