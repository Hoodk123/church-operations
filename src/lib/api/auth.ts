// Auth + identity calls, typed with zod (docs/09 Phase 4: typed client).
// [local-first]
import { z } from "zod";
import { api } from "./client";

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
});

/** team_members row of the signed-in user; null when the account has no member link. */
export const memberSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  role: z.string(),
});

export const meSchema = z.object({
  user: userSchema,
  member: memberSchema.nullable(),
});

export type Me = z.infer<typeof meSchema>;
export type ApiMember = z.infer<typeof memberSchema>;

const loginSchema = z.object({
  user: userSchema,
});

export type LoginResult = z.infer<typeof loginSchema>;

export async function login(email: string, password: string): Promise<LoginResult> {
  return api<LoginResult>("/api/auth/login", { method: "POST", json: { email, password } });
}

export async function logout(): Promise<void> {
  await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function me(): Promise<Me> {
  return meSchema.parse(await api<unknown>("/api/auth/me"));
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api<{ ok: boolean }>("/api/auth/password", {
    method: "POST",
    json: { currentPassword, newPassword },
  });
}
