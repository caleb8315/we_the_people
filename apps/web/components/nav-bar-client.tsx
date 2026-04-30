'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './signout-button';

/**
 * Light-theme navigation bar (April 2026 redesign).
 *
 * Mobile: minimal header — amber logo tile, greeting + location, avatar.
 * Desktop (sm+): same row, plus a horizontal pill nav centered between
 * the greeting and the avatar.
 *
 * Global bottom pill nav handles the primary navigation on mobile.
 */

export function NavBarClient({
  signedIn,
  displayName,
}: {
  signedIn: boolean;
  displayName: string | null;
}) {
  const pathname = usePathname();

  const links = [
    { href: '/feed', label: 'Feed' },
    { href: '/verify', label: 'Verify' },
    { href: '/briefings', label: 'Briefings' },
    ...(signedIn ? [{ href: '/notifications', label: 'Notifications' }] : []),
    ...(signedIn ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
  ];

  const greeting = displayName ? `Hello, ${displayName}` : 'Hello there';

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2.5 sm:gap-6 sm:px-6 sm:py-4">
        {/* Amber logo tile — mirrors the reference's square app icon. */}
        <Link href="/" className="group flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-base font-bold text-white shadow-sm"
          >
            ✓
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
              {greeting}
            </span>
            <span className="text-sm font-semibold text-ink">Crosscheck</span>
          </span>
        </Link>

        {/* Mobile: compact greeting stack */}
        <div className="flex min-w-0 flex-col leading-tight sm:hidden">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
            {greeting}
          </span>
          <span className="truncate text-[12px] font-semibold text-ink">Live coverage feed</span>
        </div>

        {/* Desktop pill nav */}
        <nav className="ml-auto hidden items-center gap-1 rounded-full border border-ink-100 bg-paper/70 p-1 shadow-sm md:flex">
          {links.map((l) => {
            const isActive = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
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
          {signedIn ? (
            <>
              <Link
                href="/settings"
                aria-label="Account settings"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-paper text-ink-500 hover:border-ink-200 hover:text-ink"
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
              className="rounded-full bg-ink-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
