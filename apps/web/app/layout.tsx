import './globals.css';
// Leaflet's default stylesheet is loaded at the root so the map tiles
// render with correct dimensions wherever <SignalsMap /> is used. The
// stylesheet must be imported from the root layout (a Server Component) —
// Next.js App Router refuses global CSS from node_modules inside
// `'use client'` files and will fail the production build silently.
import 'leaflet/dist/leaflet.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NavBar } from '@/components/nav-bar';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'Crosscheck — see where reporting agrees, conflicts, and lacks evidence',
  description:
    'Crosscheck clusters public reporting and open sensor data by event, then shows how sources agree, where they conflict, and which pieces of evidence are missing. Not an OSINT investigation tool. Not a news app. A system for source consistency.',
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 py-5 pb-28 sm:px-5 sm:py-10 sm:pb-24">{children}</main>
        <MobileBottomNav signedIn={signedIn} />
        <footer className="mx-auto hidden max-w-6xl px-4 pb-24 pt-10 text-xs text-white/50 sm:block sm:px-5 sm:pb-10">
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} Crosscheck</span>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            {!signedIn && (
              <Link href="/trust" className="hover:text-white">
                Methodology
              </Link>
            )}
          </div>
          <p className="mt-3 max-w-2xl">
            Crosscheck describes how public reporting agrees, conflicts, and where evidence is
            missing across sources and sensor networks. Every signal links to the underlying
            reports; every disagreement shows both sides. It is not an investigation tool and not
            a news app.
          </p>
        </footer>
      </body>
    </html>
  );
}
