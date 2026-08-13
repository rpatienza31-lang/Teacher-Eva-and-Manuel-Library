import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageEntitlements } from "@/lib/roles";
import { grantEntitlement } from "@/lib/entitlements";
import { createMagicLink } from "@/lib/auth";
import { magicLinkUrl, sendWelcomeGrantEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { grantSchema } from "@/lib/validation";

/**
 * Real-time grant (SPEC §9.2) — the everyday action. Owner/Sales only.
 *
 * type buyer email+name → pick product(s) → Grant. Account is created if new,
 * and the buyer immediately gets a welcome email with a login link + the list
 * of what they can now access. They can download within seconds.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["staff", "admin"]);
    // Belt-and-suspenders: only Sales + Owner (§16.4).
    if (!canManageEntitlements(ctx.user))
      throw new HttpError(403, "Only Sales and Owner can grant access");

    const { email, fullName, productIds, orderRef } = grantSchema.parse(
      await req.json()
    );

    // Validate that every product exists and is active.
    const rows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));
    if (rows.length !== productIds.length)
      throw new HttpError(400, "One or more products not found");

    let userId = "";
    let anyNewUser = false;
    for (const pid of productIds) {
      const res = await grantEntitlement({
        email,
        fullName,
        productId: pid,
        grantedBy: ctx.user.id,
        source: "manual",
        orderRef,
      });
      userId = res.userId;
      anyNewUser = anyNewUser || res.userCreated;
    }

    await audit({
      actorId: ctx.user.id,
      action: "entitlement.grant",
      targetType: "user",
      targetId: userId,
      metadata: { email, productIds, orderRef },
      ip: clientIp(req),
    });

    // Welcome email with login link + list of what they can now access.
    const { rawToken } = await createMagicLink(email, fullName);
    await sendWelcomeGrantEmail({
      to: email,
      link: magicLinkUrl(rawToken),
      productTitles: rows.map((p) => p.title),
    });

    return NextResponse.json({ ok: true, userId, userCreated: anyNewUser });
  } catch (err) {
    return jsonError(err);
  }
}
