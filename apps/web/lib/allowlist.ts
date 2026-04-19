/**
 * Beta allowlist check. Accepts:
 *   - Comma-separated entries in BETA_ALLOWLIST (emails or @domain suffixes)
 *   - Rows in public.beta_allowlist (authoritative; checked via admin client)
 */

import { serverEnv } from './env';
import { getAdminSupabase } from './supabase-server';

export async function isEmailAllowed(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const env = serverEnv();

  if (env.BETA_ALLOWLIST) {
    const entries = env.BETA_ALLOWLIST.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const entry of entries) {
      if (entry.startsWith('@') && e.endsWith(entry)) return true;
      if (entry === e) return true;
    }
  }

  try {
    const sb = getAdminSupabase();
    const { data } = await sb.from('beta_allowlist').select('email').eq('email', e).maybeSingle();
    if (data) return true;
  } catch {
    // allow falling through to deny
  }

  return false;
}
