import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refresh the Supabase session on every request and attach a CSP header.
 * Public routes are allowed anonymously (feed, briefings, signal pages).
 * Only settings/feedback require auth.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseConfigured = !!url && !!anon;

  const protectedPrefixes = ['/settings', '/ops', '/dashboard', '/onboarding', '/notifications'];
  const isProtectedRoute = protectedPrefixes.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  // Fail CLOSED on protected routes when auth isn't configured. A previous
  // version left these routes open if the Supabase env vars were missing,
  // which would silently disable the auth gate on any misconfigured deploy.
  if (!supabaseConfigured) {
    if (isProtectedRoute) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/login';
      redirect.searchParams.set('next', request.nextUrl.pathname);
      redirect.searchParams.set('reason', 'auth_unavailable');
      return NextResponse.redirect(redirect);
    }
    // Public routes continue — they don't require auth — but we still set
    // the CSP header below so the app stays behind the same CSP.
  } else {
    const supabase = createServerClient(url!, anon!, {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          response.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: any) => {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    if (isProtectedRoute && !data.user) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/login';
      redirect.searchParams.set('next', request.nextUrl.pathname);
      return NextResponse.redirect(redirect);
    }
  }

  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
