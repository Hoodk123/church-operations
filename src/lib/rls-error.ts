// Central helper for surfacing Supabase/PostgREST failures instead of
// failing silently. RLS denials and constraint violations arrive as
// PostgREST errors with codes like 42501 / PGRST205 / 23505; map the
// common ones to messages a volunteer can act on, and fall back to the
// raw message for everything else.

export interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  '42501': "You don't have permission to do that. Ask an admin to check your role.",
  PGRST301: 'Your session has expired. Please sign in again.',
  '23505': 'That already exists.',
  '23503': 'This references something that no longer exists.',
  '23514': 'A value is not allowed here.',
  '23502': 'A required value is missing.',
  PGRST205: 'Could not find the requested data. Try refreshing the page.',
};

export function rlsErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.';

  const err = error as SupabaseErrorLike;
  const code = typeof err.code === 'string' ? err.code : undefined;

  if (code && FRIENDLY_MESSAGES[code]) {
    const generic = FRIENDLY_MESSAGES[code];
    const raw = err.message ?? '';
    return raw && !raw.includes(generic) ? `${generic} (${raw})` : generic;
  }

  if (typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }

  return 'Something went wrong.';
}

/** True when the error is an RLS / permission denial. */
export function isPermissionError(error: unknown): boolean {
  const code = (error as SupabaseErrorLike | null)?.code;
  return code === '42501' || code === 'PGRST301';
}

/**
 * Extract the error from a Supabase response tuple and, if present,
 * return a normalized message. Use after every `.select()/.insert()...`:
 *
 *   const { data, error } = await supabase.from('people').select();
 *   const message = supabaseErrorMessage(error);
 *   if (message) toast.error(message);
 */
export function supabaseErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return rlsErrorMessage(error);
}
