// Excel import, people rows (docs/09 Phase 3 "Excel import ... as an API job
// with the same validation"). The original docs/07 Part D spec is missing
// from the repo, so per the confirmed decision the accepted columns are the
// People fields; every row runs the same validation rules as person create,
// and the response is a row-by-row report that never echoes personal data.
//
// Accepts a single multipart "file" part with CSV text (Excel's "Save as
// CSV"); max 1000 rows, max 5 MB. Admin-only action.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.js";
import { currentMember } from "../lib/route-helpers.js";
import { parseCsv, type ParsedCsv } from "../lib/csv.js";import { normalizeRwandaPhone } from "../lib/phone.js";
import {
  asCategory,
  asContactPreference,
  asFollowUpStatus,
  asGender,
  asAgeGroup,
} from "../lib/enums.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
]);

// Column aliases (Excel headers vary); values map into person create.
const headerAliases: Record<string, string> = {
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  phone: "phone",
  "phone number": "phone",
  gender: "gender",
  location: "location",
  category: "category",
  "age group": "ageGroup",
  agegroup: "ageGroup",
  "follow-up status": "followUpStatus",
  "follow up status": "followUpStatus",
  email: "email",
  notes: "notes",
  "hbf group": "hbfGroup",
  hbf_group: "hbfGroup",
  hbfgroup: "hbfGroup",
};

const rowSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  phone: z.string().trim(),
  gender: z.enum(["Male", "Female"]),
  location: z.string().trim().max(120).optional(),
  category: z.enum(["Visitor", "New Convert", "M1 Class", "Member", "Returning", "Counseling"]).optional(),
  ageGroup: z.enum(["Child", "Youth", "Adult", "Elderly"]).optional(),
  followUpStatus: z.enum(["Not Started", "Contacted", "Met", "Ongoing", "Completed"]).optional(),
  email: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
  hbfGroup: z.string().trim().max(80).optional(),
});

interface RowError {
  row: number; // 2-based data row number (header is row 1)
  field: string; // which column failed; never the value itself
  reason: string;
}

/** Maps one CSV record to a validated person-create payload. */
function validateRow(raw: Record<string, string>): z.output<typeof rowSchema> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = headerAliases[key.toLowerCase().trim()];
    if (canonical && value !== "") mapped[canonical] = value;
  }
  const parsed = rowSchema.safeParse({
    firstName: mapped.firstName ?? "",
    lastName: mapped.lastName ?? "",
    phone: mapped.phone ?? "",
    gender: mapped.gender ?? "",
    location: mapped.location,
    category: mapped.category ?? "Visitor",
    ageGroup: mapped.ageGroup,
    followUpStatus: mapped.followUpStatus ?? "Not Started",
    email: mapped.email,
    notes: mapped.notes,
    hbfGroup: mapped.hbfGroup,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const error = new Error("invalid row") as Error & { field?: string };
    error.field = issue?.path.join(".") || "row";
    throw error;
  }
  return parsed.data;
}

export function registerImportRoutes(app: FastifyInstance): void {
  app.post("/api/imports/people", { config: { access: "auth", action: "import:run" } }, async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: "CSV file required" });
    }
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return reply.code(400).send({ error: "file type not allowed" });
    }
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_FILE_BYTES) {
      return reply.code(413).send({ error: "body too large" });
    }
    let parsed: ParsedCsv | null;
    try {
      parsed = parseCsv(buffer.toString("utf8"));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return reply.code(400).send({ error: "cannot parse CSV" });
    }
const requiredHeaders = ["firstName", "phone"];
const headersLower = parsed.headers.map((h) => h.toLowerCase());
const normalizedHeaders = new Set(headersLower.map((h) => headerAliases[h] ?? h));
if (!requiredHeaders.every((required) => normalizedHeaders.has(required))) {
      return reply.code(400).send({ error: "header row must contain First Name and Phone" });
    }

    const member = await currentMember(req.prisma, req.user!);
    const report: RowError[] = [];
    let created = 0;
    let rowNumber = 1;

    for (const record of parsed.rows) {
      rowNumber += 1;
      try {
        const input = validateRow(record);
        const phone = normalizeRwandaPhone(input.phone);
        if (!phone) {
          report.push({ row: rowNumber, field: "phone", reason: "invalid phone number" });
          continue;
        }
        const duplicate = await req.prisma.people.findFirst({ where: { phone }, select: { id: true } });
        if (duplicate) {
          report.push({ row: rowNumber, field: "phone", reason: "phone already registered" });
          continue;
        }
        const successful = await req.prisma.people.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            gender: asGender(input.gender),
            ageGroup: input.ageGroup ? asAgeGroup(input.ageGroup) : null,
            phone,
            location: input.location ?? null,
            hbfGroup: input.hbfGroup ?? null,
            category: asCategory(input.category ?? "Visitor"),
            followUpStatus: asFollowUpStatus(input.followUpStatus ?? "Not Started"),
            contactPreference: input.email ? asContactPreference("Email") : null,
            email: input.email ?? null,
            notes: input.notes ?? null,
            source: "excel_import",
            registeredBy: member?.id ?? null,
          },
          select: { id: true },
        });
        void successful;
        created += 1;
      } catch (error) {
        report.push({
          row: rowNumber,
          field: error instanceof Error && (error as { field?: string }).field ? (error as { field?: string }).field! : "row",
          reason: "invalid value",
        });
      }
    }

    await audit(req.prisma, {
      userId: req.user!.id,
      action: "people.imported",
      entity: "people",
      entityId: null,
      message: `people import: ${created} created`,
    });

    return {
      created,
      rows: rowNumber - 1,
      skipped: report.length,
      errors: report.slice(0, 100),
    };
  });
}
