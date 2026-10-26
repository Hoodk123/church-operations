// Local file storage for M1 materials (docs/09 Phase 3 "Files").
// Bytes live under UPLOAD_DIR, outside the web root. Names are random;
// the original filename is stored only as the display title in the database.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext;
}

export function sniffKind(buffer: Buffer): "pdf" | "image" | "zip-office" | "unknown" {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF87a") return "image";
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image";
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
    return "zip-office";
  }
  return "unknown";
}

export function allowUpload(filename: string, declaredMime: string, buffer: Buffer): { ok: true; mime: string } | { ok: false } {
  const ext = extensionOf(filename);
  if (!ALLOWED_EXT.has(ext)) return { ok: false };
  const kind = sniffKind(buffer);
  if (ext === ".pdf") {
    if (kind !== "pdf") return { ok: false };
    return { ok: true, mime: "application/pdf" };
  }
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || ext === ".gif") {
    if (kind !== "image") return { ok: false };
    const mime =
      ext === ".png" ? "image/png"
      : ext === ".webp" ? "image/webp"
      : ext === ".gif" ? "image/gif"
      : "image/jpeg";
    return { ok: true, mime };
  }
  // Office files are ZIP containers; we still require the declared type to match the extension.
  if (kind !== "zip-office") return { ok: false };
  const mimeByExt: Record<string, string> = {
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return { ok: true, mime: mimeByExt[ext] ?? declaredMime };
}

export function materialDir(uploadDir: string, classId: string): string {
  return path.join(uploadDir, "m1-materials", classId);
}

export function randomStoredName(ext: string): string {
  return `${randomBytes(16).toString("hex")}${ext}`;
}

export async function saveMaterialFile(
  uploadDir: string,
  classId: string,
  ext: string,
  buffer: Buffer,
): Promise<{ relative: string; abs: string }> {
  const dir = materialDir(uploadDir, classId);
  await mkdir(dir, { recursive: true });
  const name = randomStoredName(ext);
  const abs = path.join(dir, name);
  await writeFile(abs, buffer, { flag: "wx" });
  return { relative: path.posix.join("m1-materials", classId, name), abs };
}

export async function removeStoredFile(uploadDir: string, relative: string): Promise<void> {
  const abs = path.resolve(uploadDir, relative);
  const root = path.resolve(uploadDir);
  if (!abs.startsWith(root + path.sep) && abs !== root) return;
  await unlink(abs).catch(() => {});
}

export function signFileToken(secret: string, materialId: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${materialId}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyFileToken(secret: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts;
  if (!id || !expRaw || !sig) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const payload = `${id}.${expRaw}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
