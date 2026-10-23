// Rwanda phone normalization for the API — same rules as the frontend's
// src/lib/phone.ts so screens behave identically after the Phase 4 port.
import { parsePhoneNumberFromString } from "libphonenumber-js";

const FALLBACK = /^(?:\+250|0)?7[2398]\d{7}$/;

export function normalizeRwandaPhone(input: string): string | null {
  const trimmed = input.replace(/\s+/g, "");
  if (FALLBACK.test(trimmed)) {
    const parsed = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+250${trimmed.replace(/^\+?250|0/, "")}`, "RW");
    if (parsed && parsed.isValid()) {
      return parsed.formatInternational();
    }
  }
  const parsed = parsePhoneNumberFromString(trimmed, "RW");
  if (parsed && parsed.isValid() && parsed.country === "RW") {
    return parsed.formatInternational();
  }
  return null;
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}
