// Phase 2 seed (docs/09): fake data only, runs against the local Postgres via
// the church_app role (the same role the Phase 3 API will use).
//
// - Re-runnable and idempotent: every row either already exists or is created
//   (skipped if present). Derived fields that triggers maintain are never
//   hand-written here, and existing rows are never "repaired" back.
// - People/attendance/contact rows are seed-only fake data. Phones use a
//   clearly fake range (+25079 000 xxx) - never real numbers (docs/09 rule).
// - One user per role is created with RANDOM passwords; they are printed
//   ONCE on first run and never stored in the repo. Logs (this terminal)
//   are local output only. If lost, wipe dev data with db-reset-dev.sh and
//   seed again.
//
// Run: npx prisma db seed
import "dotenv/config";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

// church_app creds live in the same .env the Docker stack uses.
const db = process.env.POSTGRES_DB ?? "church";
const port = process.env.PG_PORT ?? "5432";
const appPassword = process.env.CHURCH_APP_PASSWORD ?? "";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: `postgresql://church_app:${encodeURIComponent(appPassword)}@127.0.0.1:${port}/${db}`,
  }),
});

function randomPassword(): string {
  // printable, long enough to survive eyeballing once; not committed anywhere
  return randomBytes(24).toString("base64url");
}

// Deterministic seed-only uuids (traceable to this file; never real data)
const T = {
  admin: "00000000-0000-4000-8000-0000000000a1",
  desk: "00000000-0000-4000-8000-0000000000a2",
  coord: "00000000-0000-4000-8000-0000000000a3",
  pastor: "00000000-0000-4000-8000-0000000000a4",
};

async function main() {
  // 1. team members (one per role) ------------------------------------------------
  const staff = [
    { id: T.admin, fullName: "Aline Uwase", role: "Admin", email: "admin@church.test" },
    { id: T.desk, fullName: "Jean Bosco Habimana", role: "InfoDesk", email: "desk@church.test" },
    {
      id: T.coord,
      fullName: "Clarine Mukamana",
      role: "FollowUpCoordinator",
      email: "coordinator@church.test",
    },
    { id: T.pastor, fullName: "Emmanuel Nsengiyumva", role: "Pastor", email: "pastor@church.test" },
  ] as const;

  for (const s of staff) {
    const existing = await prisma.users.findUnique({ where: { email: s.email } });
    let userId = existing?.id;
    if (!existing) {
      const password = randomPassword();
      const passwordHash = await argon2.hash(password);
      const created = await prisma.users.create({
        data: { email: s.email, passwordHash: passwordHash, role: s.role },
      });
      userId = created.id;
      // printed ONCE on first run; never committed to git
      console.log(`[seed] ${s.role} ${s.email} -> password: ${password}`);
    }
    await prisma.teamMembers.upsert({
      where: { id: s.id },
      create: { id: s.id, fullName: s.fullName, role: s.role, userId: userId! },
      // leave an existing user link untouched
      update: {},
    });
  }

  // 2. people ---------------------------------------------------------------------
  // fake numbers only: +250 79 900 00xx
  const people: Array<Parameters<typeof prisma.people.create>[0]["data"]> = [
    {
      id: "00000000-0000-4000-8000-000000000101",
      firstName: "Diane",
      lastName: "Mutesi",
      gender: "Female",
      phone: "+250799000011",
      location: "Kigali",
      category: "Visitor",
      followUpStatus: "NotStarted",
      contactPreference: "WhatsApp",
      howFoundChurch: "Facebook",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      firstName: "Pacifique",
      lastName: "Nkurunziza",
      gender: "Male",
      phone: "+250799000012",
      location: "Kigali",
      category: "NewConvert",
      followUpStatus: "Contacted",
      needsPastor: false,
      contactPreference: "Call",
      needsM1: true,
      m1Status: "NotStarted",
      needsBaptism: true,
      baptismStatus: "NotYet",
    },
    {
      id: "00000000-0000-4000-8000-000000000109",
      firstName: "Sandra",
      lastName: "Ingabire",
      gender: "Female",
      phone: "+250799000013",
      location: "Kigali",
      category: "M1Class",
      followUpStatus: "Met",
      m1Status: "InProgress",
      needsM1: true,
      contactPreference: "WhatsApp",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      firstName: "Erasme",
      lastName: "Byiringiro",
      gender: "Male",
      phone: "+250799000014",
      location: "Kigali",
      category: "Member",
      followUpStatus: "Completed",
      hbfGroup: "HBF Devotion",
      contactPreference: "WhatsApp",
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      firstName: "Josiane",
      lastName: "Nyirahatunze",
      gender: "Female",
      phone: "+250799000015",
      location: "Kigali",
      category: "Returning",
      followUpStatus: "Ongoing",
      needsPastor: true,
      contactPreference: "Call",
    },
    {
      id: "00000000-0000-4000-8000-000000000105",
      firstName: "Fides",
      lastName: "Kalinda",
      gender: "Female",
      phone: "+250799000016",
      location: "Kigali",
      category: "Visitor",
      followUpStatus: "NotStarted",
      contactPreference: "Both",
    },
    {
      id: "00000000-0000-4000-8000-000000000106",
      firstName: "Aime",
      lastName: "Twagira",
      gender: "Male",
      phone: "+250799000017",
      location: "Kigali",
      category: "M1Class",
      followUpStatus: "Met",
      m1Status: "InProgress",
      needsM1: true,
      needsBaptism: true,
      baptismStatus: "NotYet",
      contactPreference: "Call",
    },
    {
      id: "00000000-0000-4000-8000-000000000107",
      firstName: "Glory",
      lastName: "Ufitwenetuyange",
      gender: "Female",
      phone: "+250799000018",
      location: "Kigali",
      category: "NewConvert",
      followUpStatus: "Contacted",
      needsPastor: false,
      needsBaptism: true,
      baptismStatus: "Scheduled",
      contactPreference: "WhatsApp",
    },
    {
      id: "00000000-0000-4000-8000-000000000108",
      firstName: "Samuel",
      lastName: "Kayigi",
      gender: "Male",
      phone: "+250799000019",
      location: "Kigali",
      category: "Member",
      followUpStatus: "Completed",
      hbfGroup: "HBF Witness",
      contactPreference: "SMS",
    },
  ];

  for (const p of people) {
    await prisma.people.upsert({
      where: { id: p.id },
      create: p,
      update: {},
    });
  }

  // 3. message templates (wording kept identical to the live system) --------------
  const templates: Array<{ name: string; body: string; purpose: string; sortOrder: number; suggestedCategory?: string }> = [
    {
      name: "Visitor welcome",
      body:
        "Hello {name}, thank you for worshipping with us on Sunday. We were glad to meet you. Is there anything we can pray about with you this week? From {volunteer}, Church Operations.",
      purpose: "follow_up",
      sortOrder: 1,
      suggestedCategory: "Visitor",
    },
    {
      name: "New convert",
      body:
        "Hello {name}, we are so happy about your decision to follow Jesus. We would love to walk with you. When can we meet this week? From {volunteer}.",
      purpose: "follow_up",
      sortOrder: 2,
      suggestedCategory: "New Convert",
    },
    {
      name: "We missed you",
      body:
        "Hello {name}, we missed you on Sunday and are thinking of you. Is everything well? From {volunteer}.",
      purpose: "follow_up",
      sortOrder: 3,
    },
    {
      name: "M1 class invitation",
      body:
        "Hello {name}, our next M1 class is coming up and we would love to see you there. Can we count on you? From {volunteer}.",
      purpose: "follow_up",
      sortOrder: 4,
      suggestedCategory: "M1 Class",
    },
    {
      name: "M1 class reminder",
      body:
        "Hello {name}, a reminder that {class} Day {day} is on {date} at {time}, {venue}. We look forward to seeing you. From {volunteer}.",
      purpose: "m1_reminder",
      sortOrder: 10,
    },
    {
      name: "M1 missed class",
      body:
        "Hello {name}, we missed you at {class} Day {day} and we are thinking of you. This is what we studied: {summary} The notes are here: {materials_link} You are welcome at the next class on {next_date}. If something kept you away and you would like to share, you can tell us here: {reply_link} From {volunteer}.",
      purpose: "m1_catch_up",
      sortOrder: 11,
    },
    {
      name: "M1 notes",
      body:
        "Hello {name}, here are the notes from {class}: {materials_link} The link works for 7 days. From {volunteer}.",
      purpose: "m1_materials",
      sortOrder: 12,
    },
    {
      name: "M1 certificate ready",
      body:
        "Hello {name}, congratulations on completing {class}. Your certificate is ready to collect. From {volunteer}.",
      purpose: "m1_certificate",
      sortOrder: 13,
    },
    {
      name: "Baptism reminder",
      body:
        "Hello {name}, your baptism is on {date} at {time}, {venue}. We are praying with you. From {volunteer}.",
      purpose: "baptism_reminder",
      sortOrder: 14,
    },
  ];

  for (const t of templates) {
    await prisma.messageTemplates.upsert({
      where: { name: t.name },
      create: {
        name: t.name,
        body: t.body,
        purpose: t.purpose as never,
        sortOrder: t.sortOrder,
        suggestedCategory: (t.suggestedCategory ?? undefined) as never,
        createdBy: T.coord,
      },
      update: {},
    });
  }

  // 4. run the demo class + baptism service --------------------------------------
  const classId = "00000000-0000-4000-8000-000000000c01";
  await prisma.m1Classes.upsert({
    where: { id: classId },
    create: {
      id: classId,
      title: "M1 Class - October",
      venue: "Main hall",
      requiredDays: 3,
      status: "Open",
      createdBy: T.pastor,
    },
    update: {},
  });

  // sessions: two past days (seed-safe fake dates in 2026)
  const sessions = [
    { id: "00000000-0000-4000-8000-000000000201", day: 1, date: "2026-10-04", topic: "Foundations" },
    { id: "00000000-0000-4000-8000-000000000202", day: 2, date: "2026-10-11", topic: "Reading the Bible" },
  ];
  for (const s of sessions) {
    await prisma.m1Sessions.upsert({
      where: { classId_dayNumber: { classId: classId, dayNumber: s.day } },
      create: {
        id: s.id,
        classId: classId,
        dayNumber: s.day,
        sessionDate: new Date(`${s.date}T00:00:00Z`),
        topic: s.topic,
        closed: false,
      },
      update: {},
    });
  }

  // enrollments: Pacifique was enrolled by the desk; Aime and Sandra walk in
  const enrollments = [
    { id: "00000000-0000-4000-8000-000000000e01", personId: "00000000-0000-4000-8000-000000000102", walkIn: false },
    { id: "00000000-0000-4000-8000-000000000e02", personId: "00000000-0000-4000-8000-000000000106", walkIn: true },
    { id: "00000000-0000-4000-8000-000000000e03", personId: "00000000-0000-4000-8000-000000000109", walkIn: true },
  ];
  for (const e of enrollments) {
    await prisma.m1Enrollments.upsert({
      where: { classId_personId: { classId: classId, personId: e.personId } },
      create: {
        id: e.id,
        classId: classId,
        personId: e.personId,
        enrolledBy: T.desk,
        walkIn: e.walkIn ?? false,
        status: "Enrolled",
      },
      update: {},
    });
  }

  // attendance: day 1 ticks (by the info desk volunteer); triggers keep people.m1_status in step
  const attendance = [
    { personId: "00000000-0000-4000-8000-000000000102", sessionId: sessions[0]!.id },
    { personId: "00000000-0000-4000-8000-000000000106", sessionId: sessions[0]!.id },
    { personId: "00000000-0000-4000-8000-000000000102", sessionId: sessions[1]!.id },
  ];
  for (const a of attendance) {
    await prisma.m1Attendance.upsert({
      where: { sessionId_personId: { sessionId: a.sessionId, personId: a.personId } },
      create: {
        sessionId: a.sessionId,
        personId: a.personId,
        status: "Present",
        markedBy: T.desk,
      },
      update: {},
    });
  }

  // 5. baptism service -------------------------------------------------------------
  const eventId = "00000000-0000-4000-8000-000000000b01";
  await prisma.baptismEvents.upsert({
    where: { id: eventId },
    create: {
      id: eventId,
      eventDate: new Date("2026-11-08T00:00:00Z"),
      eventTime: new Date("2026-11-08T09:00:00Z"),
      venue: "Riverside venue",
      officiant: "Pastor Emmanuel",
      status: "Scheduled",
      createdBy: T.pastor,
    },
    update: {},
  });

  const registrations = [
    { id: "00000000-0000-4000-8000-000000000801", personId: "00000000-0000-4000-8000-000000000107" },
    { id: "00000000-0000-4000-8000-000000000802", personId: "00000000-0000-4000-8000-000000000106" },
  ];
  for (const r of registrations) {
    await prisma.baptismRegistrations.upsert({
      where: { eventId_personId: { eventId: eventId, personId: r.personId } },
      create: {
        id: r.id,
        eventId: eventId,
        personId: r.personId,
        status: "Registered",
        createdBy: T.pastor,
      },
      update: {},
    });
  }

  // 6. a couple of sample check-ins and follow-up logs ------------------------------
  await prisma.attendance.upsert({
    where: {
      personId_serviceDate_serviceName: {
        personId: "00000000-0000-4000-8000-000000000103",
        serviceDate: new Date("2026-10-11T00:00:00Z"),
        serviceName: "Sunday Service",
      },
    },
    create: {
      personId: "00000000-0000-4000-8000-000000000103",
      serviceDate: new Date("2026-10-11T00:00:00Z"),
      serviceName: "Sunday Service",
      checkedInBy: T.desk,
    },
    update: {},
  });

  const personId103 = "00000000-0000-4000-8000-000000000103";
  const contactLogCount = await prisma.contactLog.count({ where: { personId: personId103, contactedBy: T.coord } });
  if (contactLogCount === 0) {
    // the insert trigger keeps people.needs_pastor / follow_up_status in step
    await prisma.contactLog.create({
      data: {
        personId: personId103,
        contactedBy: T.coord,
        method: "Call",
        outcome: "NeedsPastor",
        note: "Called about coming back on Sunday",
      },
    });
  }

  const counts = {
    users: await prisma.users.count(),
    teamMembers: await prisma.teamMembers.count(),
    people: await prisma.people.count(),
    templates: await prisma.messageTemplates.count(),
    classes: await prisma.m1Classes.count(),
    sessions: await prisma.m1Sessions.count(),
    enrollments: await prisma.m1Enrollments.count(),
    m1Attendance: await prisma.m1Attendance.count(),
    baptisms: await prisma.baptismEvents.count(),
    registrations: await prisma.baptismRegistrations.count(),
    checkins: await prisma.attendance.count(),
    contactLogs: await prisma.contactLog.count(),
  };
  console.log("[seed] done:", counts);
}

main()
  .then(() => {
    console.log("[seed] ok");
  })
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
