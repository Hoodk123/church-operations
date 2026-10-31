import { getTemplateByPurpose } from '@/lib/api/templates';

/** The lowest sort_order template for a purpose, or null when none is seeded. */
export async function fetchTemplate(purpose: string): Promise<{ name: string; body: string } | null> {
  return getTemplateByPurpose(purpose);
}