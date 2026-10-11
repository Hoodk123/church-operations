/**
 * Message templates and the shared absence reasons.
 *
 * The reason list is used by both the public reply page and the volunteer
 * "record a reason I heard by phone" form. It must stay in step with the
 * check constraint on `m1_absence_replies.reason` (migration
 * 20261012000000_m1_baptism.sql), otherwise the database rejects the reply.
 */
export const ABSENCE_REASONS = [
  'Work',
  'Sick',
  'Transport',
  'Family',
  'Forgot',
  'Evening',
  'Other',
] as const;

export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

export type TemplatePurpose =
  | 'follow_up'
  | 'm1_reminder'
  | 'm1_catch_up'
  | 'm1_materials'
  | 'm1_certificate'
  | 'baptism_reminder';

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  purpose: string;
  sort_order: number | null;
}

export type TemplateValues = Record<string, string | null | undefined>;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fill a template body. Any sentence that still contains a placeholder we have
 * no value for is dropped whole, so a half-filled message never goes out with
 * braces in it (docs/06, "If a placeholder has no value, remove it and its
 * sentence rather than sending braces").
 */
export function fillTemplate(body: string, values: TemplateValues): string {
  const has = (key: string) => {
    const value = values[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  };

  const sentences = body.split(/(?<=\.)\s+/);
  const kept = sentences.filter((sentence) => {
    const keys = [...sentence.matchAll(PLACEHOLDER)].map((m) => m[1]);
    return keys.every(has);
  });

  return kept
    .join(' ')
    .replace(PLACEHOLDER, (_, key: string) => String(values[key]).trim())
    .replace(/\s{2,}/g, ' ')
    .trim();
}
