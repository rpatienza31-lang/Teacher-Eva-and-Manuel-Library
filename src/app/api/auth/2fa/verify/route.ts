import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, markSessionTwoFactorPassed } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";
import { verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { jsonError, HttpError } from "@/lib/guards";

const schema = z.object({ code: z.string().min(6).max(8) });

/** Verify a TOTP code for an already-enrolled staff account during login. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getSession();
    if (!ctx) throw new HttpError(401, "Not authenticated");
    if (!isStaffLike(ctx.user)) throw new HttpError(403, "2FA not applicable");

    const limit = rateLimit(`2fa:${ctx.user.id}`, 6, 5 * 60_000);
    if (!limit.ok) throw new HttpError(429, "Too many attempts, wait a few minutes");

    const { code } = schema.parse(await req.json());
    if (!ctx.user.totpSecret || !ctx.user.totpEnabled)
      throw new HttpError(400, "2FA not set up");
    if (!verifyTotp(code, ctx.user.totpSecret)) {
      await audit({
        actorId: ctx.user.id,
        action: "auth.2fa_failed",
        ip: clientIp(req),
      });
      throw new HttpError(400, "Invalid code");
    }

    await markSessionTwoFactorPassed(ctx.rawToken);
    await audit({
      actorId: ctx.user.id,
      action: "auth.2fa_passed",
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
