import "dotenv/config";
import { createPrisma } from "../db.js";
import { loadEnv } from "../env.js";

const prisma = createPrisma(loadEnv());
const rows = await prisma.people.findMany({ take: 5, select: { category: true, followUpStatus: true, m1Status: true } });
console.log(JSON.stringify(rows));
const logs = await prisma.contactLog.findMany({ take: 3, select: { method: true, outcome: true } });
console.log(JSON.stringify(logs));
const roles = await prisma.users.findMany({ select: { role: true }, take: 4 });
console.log(JSON.stringify(roles));
await prisma.$disconnect();
