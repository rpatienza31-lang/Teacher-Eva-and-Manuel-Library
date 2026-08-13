import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession, markSessionTwoFactorPassed } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";
import { verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";
import { jsonError, HttpError } from "@/lib/guards";

const schema = z.object({ code: z.string().min(6).max(8) });

/** Confirm a code against the pending secret to finish enrollment. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getSession();
    if (!ctx) throw new HttpError(401, "Not authenticated");
    if (!isStaffLike(ctx.user)) throw new HttpError(403, "2FA not applicable");

    const { code } = schema.parse(await req.json());
    if (!ctx.user.totpSecret) throw new HttpError(400, "Start setup first");
    if (!verifyTotp(code, ctx.user.totpSecret))
      throw new HttpError(400, "Invalid code");

    await db
      .update(users)
      .set({ totpEnabled: true })
      .where(eq(users.id, ctx.user.id));
    await markSessionTwoFactorPassed(ctx.rawToken);
    await audit({ actorId: ctx.user.id, action: "auth.2fa_enabled" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
