import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NavBar } from '@/components/nav-bar';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'OSINT Platform · Transparent Intelligence',
  description:
    'Privacy-first, transparency-first open-source intelligence. Aggregates public data, verifies events against multiple sources, and surfaces inconsistencies with neutral wording.',
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
  } catch {
    // keep anonymous fallback
  }

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <NavBar />
        <main className="mx-auto max-w-6xl px-5 py-8 pb-24 sm:py-10">{children}</main>
        <MobileBottomNav signedIn={signedIn} />
        <footer className="mx-auto max-w-6xl px-5 py-10 text-xs text-white/50">
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} OSINT Platform</span>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            {!signedIn && (
              <Link href="/trust" className="hover:text-white">
                Trust & methodology
              </Link>
            )}
          </div>
          <p className="mt-3 max-w-2xl">
            This platform surfaces evidence-backed inconsistencies between public reports and public data. It does not
            make accusations, does not use classified sources, and presents confidence levels and citations for every
            signal.
          </p>
        </footer>
      </body>
    </html>
  );
}
