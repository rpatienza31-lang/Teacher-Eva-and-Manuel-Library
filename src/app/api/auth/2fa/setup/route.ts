import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";
import { generateTotpSecret, totpQrDataUrl } from "@/lib/totp";
import { jsonError, HttpError } from "@/lib/guards";

/**
 * Begin TOTP enrollment for a staff-like account: generate + persist a pending
 * secret and return a QR the user scans. The secret is not "enabled" until a
 * code is confirmed at /api/auth/2fa/enable.
 */
export async function POST() {
  try {
    const ctx = await getSession();
    if (!ctx) throw new HttpError(401, "Not authenticated");
    if (!isStaffLike(ctx.user)) throw new HttpError(403, "2FA not applicable");
    if (ctx.user.totpEnabled) throw new HttpError(400, "2FA already enabled");

    const secret = generateTotpSecret();
    await db
      .update(users)
      .set({ totpSecret: secret })
      .where(eq(users.id, ctx.user.id));

    const qr = await totpQrDataUrl(ctx.user.email, secret);
    return NextResponse.json({ qr });
  } catch (err) {
    return jsonError(err);
  }
}
