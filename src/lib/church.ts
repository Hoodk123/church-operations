/**
 * Church details. These are deliberately placeholders so nobody has to invent
 * them — replace the values below with the real church name and the real names
 * of the people who sign the certificates, then commit.
 */
export const CHURCH_NAME = 'ROC Church';

/**
 * Signature lines at the bottom of every printed certificate. `label` is the
 * role shown under the line; `name` is who signs it. Replace both placeholder
 * names before printing for real.
 */
export const CERTIFICATE_SIGNATORIES = [
  { label: 'Pastor', name: 'Pastor' },
  { label: 'Class leader', name: 'M1 Class Coordinator' },
] as const;
