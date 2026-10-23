// Enum mapping between wire values (mirrors the DB, e.g. "New Convert") and
// the generated Prisma enum objects. The zod schemas validate the wire strings;
// these helpers convert to the generated types so runtime never sends a
// string Prisma would reject.
import {
  AgeGroup,
  BaptismStatus,
  Category,
  ContactMethod,
  ContactOutcome,
  ContactPreference,
  EnrollmentStatus,
  FollowUpStatus,
  Gender,
  M1Status,
} from "../../src/generated/prisma/client.js";

type EnumDict = Record<string, string>;

function byValue<T extends EnumDict>(dict: T, value: string): T[keyof T] {
  const entries = Object.entries(dict) as Array<[keyof T, string]>;
  for (const [key, candidate] of entries) {
    if (candidate === value) {
      return dict[key];
    }
  }
  // Callers get enum values from zod-validated input, so this is unreachable;
  // fail hard in the unlikely case.
  throw new Error("internal: enum value not in dictionary");
}

export function asCategory(value: string) {
  return byValue(Category, value);
}
export function asFollowUpStatus(value: string) {
  return byValue(FollowUpStatus, value);
}
export function asM1Status(value: string) {
  return byValue(M1Status, value);
}
export function asBaptismStatus(value: string) {
  return byValue(BaptismStatus, value);
}
export function asGender(value: string) {
  return byValue(Gender, value);
}
export function asAgeGroup(value: string) {
  return byValue(AgeGroup, value);
}
export function asContactPreference(value: string) {
  return byValue(ContactPreference, value);
}
export function asContactMethod(value: string) {
  return byValue(ContactMethod, value);
}
export function asContactOutcome(value: string) {
  return byValue(ContactOutcome, value);
}
export function asEnrollmentStatus(value: string) {
  return byValue(EnrollmentStatus, value);
}
