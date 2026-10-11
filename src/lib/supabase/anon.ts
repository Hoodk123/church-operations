import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A cookie-free client for the public reply page. It carries only the anon
 * publishable key, so the only things it can reach are the two SECURITY DEFINER
 * functions that were explicitly granted to the `anon` role.
 */
let anon: SupabaseClient | undefined;

export function createAnonClient(): SupabaseClient {
  if (!anon) {
    anon = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return anon;
}
