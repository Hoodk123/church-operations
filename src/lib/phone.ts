import { parsePhoneNumber } from 'libphonenumber-js';

export function validateRwandaPhone(value: string): {
  valid: boolean;
  formatted: string;
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, formatted: '', error: 'Phone number is required' };

  // Try parsing with Rwanda country code
  const withCode = trimmed.startsWith('+') ? trimmed : `+250${trimmed.replace(/^0/, '')}`;
  const parsed = parsePhoneNumber(withCode);

  if (parsed && parsed.isValid()) {
    return { valid: true, formatted: parsed.formatInternational() };
  }

  // Fallback: regex check for Rwanda format
  const rwRegex = /^(?:\+250|0)?7[2398]\d{7}$/;
  if (rwRegex.test(trimmed)) {
    const digits = trimmed.replace(/^(?:\+250|0)/, '');
    return { valid: true, formatted: `+250 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` };
  }

  return {
    valid: false,
    formatted: trimmed,
    error: 'Invalid Rwanda phone number. Use format: +250 7XX XXX XXX or 07XXXXXXXX',
  };
}

/** Digits only, used for duplicate matching and wa.me links. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}
