'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Floating pill bottom-nav (April 2026 redesign).
 *
 * Always visible on mobile — this is the primary navigation surface
 * for signed-out AND signed-in users. Desktop hides it.
 *
 * Matches the reference design: a dark charcoal pill that hovers above
 * the content area with a single amber accent on the active item.
 */

const LINKS = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon, authedOnly: true },
  { href: '/', label: 'Home', icon: HomeIcon, anonOnly: true },
  { href: '/feed', label: 'Feed', icon: FeedIcon },
  { href: '/notifications', label: 'Alerts', icon: BellIcon, authedOnly: true },
  { href: '/verify', label: 'Verify', icon: VerifyIcon },
  { href: '/settings', label: 'Profile', icon: ProfileIcon, authedOnly: true },
  { href: '/login', label: 'Profile', icon: ProfileIcon, anonOnly: true },
] as const;

async function postNavEvent(target: string, from: string) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_name: 'mobile_nav_used',
        event_props: { target, from },
      }),
    });
  } catch {
    // best effort telemetry
  }
}

export function MobileBottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  const links = LINKS.filter((l) => {
    if ('authedOnly' in l && l.authedOnly && !signedIn) return false;
    if ('anonOnly' in l && l.anonOnly && signedIn) return false;
    return true;
  });

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 md:hidden"
    >
      <ul className="flex w-full max-w-md items-center justify-around gap-1 rounded-full bg-charcoal-900 px-3 py-2 text-white shadow-pill-nav">
        {links.map((link) => {
          const isActive =
            pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          const Icon = link.icon;
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                onClick={() => void postNavEvent(link.href, pathname)}
                aria-label={link.label}
                aria-current={isActive ? 'page' : undefined}
                className="flex min-h-[44px] items-center justify-center"
              >
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.6)]'
                      : 'text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10" />
      <path d="M7 12h10" />
      <path d="M7 16h6" />
    </svg>
  );
}

function VerifyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.3 8.3 8 9 4.7-.7 8-4.5 8-9V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
