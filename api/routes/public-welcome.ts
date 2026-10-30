// Public welcome-form routes (docs/08 1.5). These replace the old anon RPCs:
// - POST /api/public/welcome           submit_welcome
// - POST /api/public/welcome/returning welcome_returning (phone-only shortcut)
//
// Defence in depth, per the docs: strict rate limit (per IP via the
// @fastify/rate-limit route config), honeypot field, zod validation on the
// server, a per-phone submission window, and constant-shaped JSON responses
// ({ok:true/false,...}) that never reveal whether a person exists. No
// personal data in errors or logs.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizeRwandaPhone } from "../lib/phone.js";
import { asContactPreference } from "../lib/enums.js";

const RATE_LIMIT_MAX = 5; // per IP per hour
const PHONE_WINDOW_MINUTES = 10; // 1 submission per phone per 10 min
const SERVICE_NAME = "Sunday Service"; // matches the check-in screen's default

const qrSourceSchema = z.enum(["door", "hall", "flyer", "website", "other"]);
const contactChannelSchema = z.enum(["whatsapp", "sms", "call"]);
const fellowshipSchema = z.enum(["under_1_month", "1_to_6_months", "6_to_12_months", "over_1_year"]);
const familyStatusSchema = z.enum(["alone", "spouse", "family", "private"]);
const readinessSchema = z.enum(["ready", "not_yet", "tell_me_more"]);
// Class interest types (docs/08 step 13). The catalogue table is not modelled
// yet; the stored id is validated against this list server-side.
const classTypeSchema = z.enum(["m1_membership", "m2_maturity", "siloam", "advise"]);
const foundViaSchema = z.enum([
  "Invited by someone",
  "Social media",
  "Passing by",
  "Website",
  "Event",
  "Other",
]);

/** Removes control characters and angle brackets, then trims (docs/08 1.5). */
function clean(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>]|[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E]/g, "")
    .trim();
}

const welcomeSchema = z.object({
  fullName: z.string().transform(clean).pipe(z.string().min(2).max(120)),
  phone: z.string().min(6).max(24),
  location: z.string().transform(clean).pipe(z.string().min(2).max(120)),
  preferredContact: contactChannelSchema,
  firstTime: z.boolean(),
  fellowshipDuration: fellowshipSchema.optional(),
  foundVia: foundViaSchema.optional(),
  invitedByText: z.string().transform(clean).pipe(z.string().max(120)).optional(),
  familyStatus: familyStatusSchema.optional(),
  adultsCount: z.number().int().min(0).max(20).optional(),
  childrenCount: z.number().int().min(0).max(20).optional(),
  wantsFamilyRegistration: z.boolean().default(false),
  classReadiness: readinessSchema.optional(),
  classTypes: z.array(classTypeSchema).max(4).default([]),
  feedback: z.string().transform(clean).pipe(z.string().max(1000)).optional(),
  consent: z.literal(true),
  qrSource: qrSourceSchema.optional(),
  // Honeypot: humans never fill this. Any text means bot -> fake success.
  website: z.string().max(200).optional().default(""),
});

const returningSchema = z.object({
  phone: z.string().min(6).max(24),
  website: z.string().max(200).optional().default(""),
});

/** "Kigali City" -> { firstName: "Kigali", lastName: "City" } (staff corrects later). */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const firstSpace = fullName.indexOf(" ");
  if (firstSpace === -1) return { firstName: fullName, lastName: fullName };
  return { firstName: fullName.slice(0, firstSpace), lastName: fullName.slice(firstSpace + 1).trim() || fullName };
}

function contactPreference(
  wire: z.infer<typeof contactChannelSchema>,
): ReturnType<typeof asContactPreference> {
  if (wire === "whatsapp") return asContactPreference("WhatsApp");
  if (wire === "sms") return asContactPreference("SMS");
  return asContactPreference("Call");
}

function todayDate(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

export function registerWelcomeRoutes(app: FastifyInstance): void {
  app.post(
    "/api/public/welcome",
    { config: { access: "public", rateLimit: { max: RATE_LIMIT_MAX, timeWindow: "1 hour" } } },
    async (req) => {
      const parsed = welcomeSchema.safeParse(req.body);
      if (!parsed.success) {
        return { ok: false, reason: "invalid" };
      }
      const input = parsed.data;
      const phone = normalizeRwandaPhone(input.phone);
      if (!phone) {
        return { ok: false, reason: "invalid" };
      }
      if (input.website !== "") {
        // Honeypot: pretend success, write nothing (bots learn nothing).
        return { ok: true, firstName: "" };
      }
      const phoneWindowStart = new Date(Date.now() - PHONE_WINDOW_MINUTES * 60_000);
      const recentForPhone = await req.prisma.welcomeSubmissions.count({
        where: { phone, submittedAt: { gte: phoneWindowStart } },
      });
      if (recentForPhone > 0) {
        return { ok: false, reason: "slow_down" };
      }

      const today = todayDate();
      const existing = await req.prisma.people.findFirst({
        where: { phone },
        select: { id: true, firstName: true, location: true, contactPreference: true, source: true },
      });
      let personId: string;
      let firstName: string;
      if (existing) {
        personId = existing.id;
        firstName = existing.firstName;
        // Match found: never overwrite anything, only fill EMPTY fields.
        const fill: { location?: string; contactPreference?: ReturnType<typeof contactPreference> } = {};
        if (!existing.location) fill.location = input.location;
        if (!existing.contactPreference) fill.contactPreference = contactPreference(input.preferredContact);
        if (Object.keys(fill).length > 0) {
          await req.prisma.people.update({ where: { id: personId }, data: fill });
        }
      } else {
        const name = splitFullName(input.fullName);
        const created = await req.prisma.people.create({
          data: {
            ...name,
            gender: "Male", // the form does not ask; flags/prefills stay neutral
            phone,
            location: input.location,
            category: "Visitor",
            source: "welcome_form",
            firstVisitDate: input.firstTime ? today : null,
            contactPreference: contactPreference(input.preferredContact),
            needsM1: input.classReadiness === "ready",
          },
          select: { id: true, firstName: true },
        });
        personId = created.id;
        firstName = created.firstName;
      }

      // If the person already checked in today, the submission flips to
      // checked_in (docs: step 5 of submit_welcome).
      const attendedToday = await req.prisma.attendance.findFirst({
        where: { personId, serviceDate: { equals: today } },
        select: { id: true },
      });

      await req.prisma.welcomeSubmissions.create({
        data: {
          personId,
          qrSource: input.qrSource,
          fullName: input.fullName,
          phone,
          location: input.location,
          preferredContact: input.preferredContact,
          firstTime: input.firstTime,
          fellowshipDuration: input.fellowshipDuration,
          foundVia: input.foundVia,
          invitedByText: input.invitedByText,
          familyStatus: input.familyStatus,
          adultsCount: input.adultsCount,
          childrenCount: input.childrenCount,
          wantsFamilyRegistration: input.wantsFamilyRegistration,
          classReadiness: input.classReadiness,
          feedback: input.feedback,
          consent: true,
          status: attendedToday ? "checked_in" : "new",
          checkedInAt: attendedToday ? new Date() : null,
          classInterest: {
            create: input.classTypes.map((classTypeId) => ({ classTypeId })),
          },
        },
        select: { id: true },
      });

      return { ok: true, firstName };
    },
  );

  app.post(
    "/api/public/welcome/returning",
    { config: { access: "public", rateLimit: { max: RATE_LIMIT_MAX, timeWindow: "1 hour" } } },
    async (req) => {
      const parsed = returningSchema.safeParse(req.body);
      if (!parsed.success) {
        return { ok: false };
      }
      if (parsed.data.website !== "") {
        // Honeypot: pretend success, write nothing.
        return { ok: true };
      }
      const phone = normalizeRwandaPhone(parsed.data.phone);
      if (!phone) {
        return { ok: false };
      }
      const person = await req.prisma.people.findFirst({ where: { phone }, select: { id: true } });
      if (!person) {
        // Strictly no names/details and no distinguishable "not found".
        return { ok: false };
      }
      await req.prisma.attendance.upsert({
        where: {
          personId_serviceDate_serviceName: {
            personId: person.id,
            serviceDate: todayDate(),
            serviceName: SERVICE_NAME,
          },
        },
        create: { personId: person.id },
        update: {},
      });
      return { ok: true };
    },
  );
}
