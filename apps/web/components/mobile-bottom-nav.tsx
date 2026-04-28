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
  { href: '/verify', label: 'Verify', icon: VerifyIcon },
  { href: '/briefings', label: 'Briefings', icon: BriefingsIcon, authedOnly: true },
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

function BriefingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
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
