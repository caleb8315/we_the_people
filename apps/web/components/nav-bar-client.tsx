'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './signout-button';

export function NavBarClient({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  const links = signedIn
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/feed', label: 'Feed' },
        { href: '/briefings', label: 'Briefings' },
      ]
    : [
        { href: '/feed', label: 'Feed' },
        { href: '/briefings', label: 'Briefings' },
      ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-base-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-5 sm:py-3.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-black"
          >
            W
          </span>
          <span>
            OSINT <span className="text-white/50">Platform</span>
          </span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 text-sm md:flex">
          {links.map((l) => {
            const isActive = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative rounded-full px-3 py-1.5 transition ${
                  isActive ? 'text-white' : 'text-white/65 hover:text-white'
                }`}
              >
                {l.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-[14px] h-[2px] rounded-full bg-brand-500"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden items-center gap-2 text-sm md:flex">
          {signedIn ? (
            <>
              <Link
                href="/settings"
                className="rounded-full border border-white/10 px-3 py-1.5 text-white/75 hover:border-white/25 hover:text-white"
              >
                Settings
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-white/90"
            >
              Sign in
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 md:hidden">
          {!signedIn ? (
            <Link
              href="/login"
              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90"
            >
              Sign in
            </Link>
          ) : (
            <Link
              href="/settings"
              className="rounded-full border border-white/15 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Settings
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
