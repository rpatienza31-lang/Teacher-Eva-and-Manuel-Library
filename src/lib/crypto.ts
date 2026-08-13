import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Generate a URL-safe random token (used for magic links + session ids). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hash, hex. We store hashes of tokens, never the raw token. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time comparison of two hex strings. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
