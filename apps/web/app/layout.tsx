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
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Crosscheck — see where reporting agrees, conflicts, and lacks evidence',
  description:
    'Crosscheck clusters public reporting and open sensor data by event, then shows how sources agree, where they conflict, and which pieces of evidence are missing.',
  metadataBase: new URL(siteConfig.siteUrl),
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Crosscheck',
    description:
      'See where reporting agrees, conflicts, and lacks evidence across public sources and sensor networks.',
    url: siteConfig.siteUrl,
    siteName: 'Crosscheck',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crosscheck',
    description:
      'See where reporting agrees, conflicts, and lacks evidence across public sources and sensor networks.',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  let userEmail: string | null = null;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
    userEmail = data.user?.email ?? null;
  } catch {
    // keep anonymous fallback
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pb-16 sm:pt-8">
          {children}
        </main>
        <MobileBottomNav signedIn={signedIn} />
        <footer className="mx-auto hidden max-w-6xl px-6 pb-16 pt-10 text-xs text-ink-400 sm:block">
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} Crosscheck</span>
            <Link href="/about" className="hover:text-ink-700">
              About
            </Link>
            <Link href="/sources" className="hover:text-ink-700">
              Sources
            </Link>
            <Link href="/privacy" className="hover:text-ink-700">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink-700">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-ink-700">
              Contact
            </Link>
            <Link href="/status" className="hover:text-ink-700">
              Status
            </Link>
            <Link href="/reliability" className="hover:text-ink-700">
              Reliability
            </Link>
            <Link href="/changelog" className="hover:text-ink-700">
              Changelog
            </Link>
            <Link href="/trust" className="hover:text-ink-700">
              Methodology
            </Link>
            <Link href="/corrections" className="hover:text-ink-700">
              Corrections
            </Link>
            <Link href="/dmca" className="hover:text-ink-700">
              DMCA
            </Link>
            <Link href="/sources-licensing" className="hover:text-ink-700">
              Sources & licensing
            </Link>
            {userEmail && <span className="ml-auto text-ink-300">Signed in as {userEmail}</span>}
          </div>
          <p className="mt-3 max-w-2xl">
            Crosscheck describes how public reporting agrees, conflicts, and where evidence is
            missing across sources and sensor networks. Every signal links to the underlying
            reports; every disagreement shows both sides. It is not an investigation tool and not
            a news app.
          </p>
          <p className="mt-2 max-w-2xl">
            Contact: <a href={`mailto:${siteConfig.supportEmail}`} className="underline hover:text-ink-700">{siteConfig.supportEmail}</a>{' '}
            · Security: <a href={`mailto:${siteConfig.securityEmail}`} className="underline hover:text-ink-700">{siteConfig.securityEmail}</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
