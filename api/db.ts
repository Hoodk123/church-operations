// One Prisma client per process (docs/09: "one Prisma client per process,
// pool size 10, church_app role"). Never grows past what church_app's
// CONNECTION LIMIT allows.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { databaseUrl, type Env } from "./env.js";

function newClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 10 }),
  });
}

export type ApiPrisma = ReturnType<typeof newClient>;

export function createPrisma(env: Env): ApiPrisma {
  return newClient(databaseUrl(env));
}
