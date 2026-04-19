import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from './env';

/** Route-handler / RSC Supabase client bound to the user's session. */
export function getServerSupabase() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = publicEnv();
  const store = cookies();
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      set: (name: string, value: string, options: any) => {
        try {
          store.set({ name, value, ...options });
        } catch {
          // Called from a Server Component; ignore — middleware refreshes the cookie.
        }
      },
      remove: (name: string, options: any) => {
        try {
          store.set({ name, value: '', ...options });
        } catch {
          // see above
        }
      },
    },
  });
}

/**
 * Admin client — service role key, server-only.
 * Use only in trusted route handlers (never returned to the browser).
 */
export function getAdminSupabase() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
