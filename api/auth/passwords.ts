// Password hashing with argon2id, tuned to the OWASP (2023) minimum:
// m=19456 KiB, t=2, p=1. Verification for unknown accounts runs against a
// dummy hash so login timing does not reveal which emails exist.
import argon2 from "argon2";

// A valid argon2id hash of an unrelated random value; computed lazily once.
const DUMMY = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$ZqEn9j5G7Z0L0hYvJqxMJBgYZqF3WBR3NLpVz5G8uLI";

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string | undefined | null, plain: string): Promise<boolean> {
  if (!hash) {
    await argon2.verify(DUMMY, plain).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 12) return "Password must be at least 12 characters";
  if (!/[a-z]/.test(plain) || !/[A-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return "Password must mix upper case, lower case and digits";
  }
  return null;
}
