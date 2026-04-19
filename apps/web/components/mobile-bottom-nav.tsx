'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/feed', label: 'Feed' },
  { href: '/briefings', label: 'Briefings' },
  { href: '/dashboard/intel', label: 'Intel' },
  { href: '/settings', label: 'Settings' },
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
  if (!signedIn) return null;
  // Settings has a sticky save bar; avoid overlay competition.
  if (pathname.startsWith('/settings')) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-base-900/95 px-1.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5 gap-1">
        {LINKS.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => void postNavEvent(link.href, pathname)}
                className={`block rounded-md px-1.5 py-2 text-center text-[10px] leading-tight ${
                  isActive
                    ? 'bg-white text-black'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
