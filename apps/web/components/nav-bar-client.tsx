'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './signout-button';

export function NavBarClient({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  const links = signedIn
    ? [
        { href: '/feed', label: 'Feed' },
        { href: '/verify', label: 'Verify' },
        { href: '/dashboard', label: 'Dashboard' },
      ]
    : [
        { href: '/feed', label: 'Feed' },
        { href: '/verify', label: 'Verify' },
        { href: '/about', label: 'About' },
      ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-base-900/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-5">
        <Link href={signedIn ? '/feed' : '/'} className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-black"
          >
            ✓
          </span>
          <span>Crosscheck</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 text-sm md:flex">
          {links.map(l => {
            const isActive = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 transition ${
                  isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {l.label}
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-brand-500" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {signedIn ? (
            <>
              <Link
                href="/settings"
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-white/20 hover:text-white"
              >
                Settings
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-white/90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
