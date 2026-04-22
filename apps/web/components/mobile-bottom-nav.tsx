'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/feed', label: 'Feed', icon: '◉' },
  { href: '/verify', label: 'Verify', icon: '✓' },
  { href: '/dashboard', label: 'Home', icon: '⌂' },
  { href: '/briefings', label: 'Briefs', icon: '◫' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export function MobileBottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  if (!signedIn) return null;
  if (pathname.startsWith('/settings')) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-base-900/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl md:hidden"
    >
      <ul className="grid grid-cols-5">
        {LINKS.map(link => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition ${
                  isActive
                    ? 'text-brand-400'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <span className="text-base">{link.icon}</span>
                <span className="text-[9px] font-medium">{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
