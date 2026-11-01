import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createPrisma } from "../api/db.js";
import { passwordPolicyError, hashPassword } from "../api/auth/passwords.js";
import { loadEnv } from "../api/env.js";

const accounts = [
  { email: "admin@church.test", role: "Admin", dbRole: "Admin" },
  { email: "desk@church.test", role: "Info Desk", dbRole: "InfoDesk" },
  { email: "coordinator@church.test", role: "Follow-up Coordinator", dbRole: "FollowUpCoordinator" },
  { email: "pastor@church.test", role: "Pastor", dbRole: "Pastor" },
] as const;

function createPassword(): string {
  return `${randomBytes(32).toString("base64url")}Aa1`;
}

async function main(): Promise<void> {
  if (process.env.CHURCH_ENV !== "dev") {
    throw new Error('Refusing reset: set CHURCH_ENV=dev in .env first.');
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST ?? "127.0.0.1")) {
    throw new Error("Refusing reset: database host must be local.");
  }

  const env = loadEnv();
  const prisma = createPrisma(env);
  const prompt = createInterface({ input: stdin, output: stdout });

  try {
    console.log("Choose a local seeded account:");
    accounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.role} — ${account.email}`);
    });
    const selection = await prompt.question("Account number: ");
    const account = accounts[Number(selection) - 1];
    if (!account || !/^[1-4]$/.test(selection)) {
      throw new Error("Invalid account selection.");
    }

    const user = await prisma.users.findUnique({
      where: { email: account.email },
      select: { id: true, role: true, active: true },
    });
    if (!user || user.role !== account.dbRole) {
      throw new Error("Seeded account not found with its expected role. Run the dev seed first.");
    }
    if (!user.active) {
      throw new Error("Account is inactive. Password reset does not activate accounts.");
    }

    const confirmation = await prompt.question(
      `Reset ${account.email} password and end its sessions? Type RESET to continue: `,
    );
    if (confirmation !== "RESET") {
      throw new Error("Reset cancelled.");
    }

    const password = createPassword();
    const policyError = passwordPolicyError(password);
    if (policyError) throw new Error(`Generated password failed policy: ${policyError}`);
    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.users.update({
        where: { id: user.id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      prisma.sessions.deleteMany({ where: { userId: user.id } }),
    ]);

    console.log(`Email: ${account.email}`);
    console.log(`New password (shown once): ${password}`);
    console.log("Sign in at the frontend. Store this password securely; it cannot be recovered later.");
  } finally {
    prompt.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Password reset failed.");
  process.exitCode = 1;
});
