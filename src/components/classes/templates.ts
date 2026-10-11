import type { SupabaseClient } from '@supabase/supabase-js';

/** The lowest sort_order template for a purpose, or null when none is seeded. */
export async function fetchTemplate(
  supabase: SupabaseClient,
  purpose: string
): Promise<{ name: string; body: string } | null> {
  const { data } = await supabase
    .from('message_templates')
    .select('name, body')
    .eq('purpose', purpose)
    .order('sort_order', { ascending: true })
    .limit(1);
  return data?.[0] ?? null;
}