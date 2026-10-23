// Enum bridge between the wire (the exact DB values the frontend knows, e.g.
// "New Convert", "Not Started") and the generated Prisma client (its enum
// values are the CamelCase identifiers, e.g. "NewConvert"; Prisma maps them to
// the DB values when it writes/reads SQL). Both directions live here so
// handlers never touch identifiers directly.
//
//   enumToClient(kind, wire)  -> before a write   ("New Convert" -> "NewConvert")
//   enumToWire(kind, client)  -> for a response   ("NotStarted"  -> "Not Started")
export const ENUM_MAPS = {
  Gender: { Male: "Male", Female: "Female" },
  AgeGroup: { Child: "Child", Youth: "Youth", Adult: "Adult", Elderly: "Elderly" },
  Category: { Visitor: "Visitor", "New Convert": "NewConvert", "M1 Class": "M1Class", Member: "Member", Returning: "Returning", Counseling: "Counseling" },
  FollowUpStatus: { "Not Started": "NotStarted", Contacted: "Contacted", Met: "Met", Ongoing: "Ongoing", Completed: "Completed" },
  M1Status: { "Not Started": "NotStarted", "In Progress": "InProgress", Completed: "Completed" },
  BaptismStatus: { "Not yet": "NotYet", Scheduled: "Scheduled", Baptized: "Baptized" },
  ContactPreference: { WhatsApp: "WhatsApp", Email: "Email", SMS: "SMS", Call: "Call" },
  ContactMethod: { Call: "Call", WhatsApp: "WhatsApp", SMS: "SMS", Visit: "Visit", Other: "Other" },
  ContactOutcome: { Reached: "Reached", "No answer": "NoAnswer", "Scheduled visit": "ScheduledVisit", "Needs pastor": "NeedsPastor", "Wrong number": "WrongNumber" },
  UserRole: { Admin: "Admin", "Info Desk": "InfoDesk", "Follow-up Coordinator": "FollowUpCoordinator", Pastor: "Pastor" },
} as const;

type MapKind = keyof typeof ENUM_MAPS;
type ClientValue<K extends MapKind> = (typeof ENUM_MAPS)[K][keyof (typeof ENUM_MAPS)[K]];
type WireValue<K extends MapKind> = keyof (typeof ENUM_MAPS)[K] & string;

export class EnumMappingError extends Error {}

/** Wire value -> generated client value (for writes). */
export function enumToClient<K extends MapKind>(kind: K, wire: string): ClientValue<K> {
  const mapped = (ENUM_MAPS[kind] as Record<string, string>)[wire];
  if (mapped === undefined) throw new EnumMappingError(`unknown ${kind} value`);
  return mapped as ClientValue<K>;
}

/** Generated client value -> wire value (for reads). */
export function enumToWire<K extends MapKind>(kind: K, client: string): WireValue<K> {
  const dict = ENUM_MAPS[kind] as Record<string, string>;
  for (const [wire, clientValue] of Object.entries(dict)) {
    if (clientValue === client) return wire as WireValue<K>;
  }
  throw new EnumMappingError(`unknown client value for ${kind}`);
}

/**
 * Tolerant response conversion: rows may hold either form (identifiers come
 * from Prisma reads; older manual values rotate in tests). Unknown values pass
 * through unchanged instead of failing the request.
 */
export function humanize(kind: MapKind, client: string | null | undefined): string | null {
  if (client === null || client === undefined) return null;
  try {
    return enumToWire(kind, client);
  } catch {
    return client;
  }
}

// Convenience named conversions used across routes.
export function asCategory(value: string) {
  return enumToClient("Category", value);
}
export function asFollowUpStatus(value: string) {
  return enumToClient("FollowUpStatus", value);
}
export function asM1Status(value: string) {
  return enumToClient("M1Status", value);
}
export function asBaptismStatus(value: string) {
  return enumToClient("BaptismStatus", value);
}
export function asGender(value: string) {
  return enumToClient("Gender", value);
}
export function asAgeGroup(value: string) {
  return enumToClient("AgeGroup", value);
}
export function asContactPreference(value: string) {
  return enumToClient("ContactPreference", value);
}
export function asContactMethod(value: string) {
  return enumToClient("ContactMethod", value);
}
export function asContactOutcome(value: string) {
  return enumToClient("ContactOutcome", value);
}
