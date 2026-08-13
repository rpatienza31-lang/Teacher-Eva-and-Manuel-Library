import type { NextRequest } from "next/server";

/** Best-effort client IP from proxy headers (Cloudflare / Vercel). */
export function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
