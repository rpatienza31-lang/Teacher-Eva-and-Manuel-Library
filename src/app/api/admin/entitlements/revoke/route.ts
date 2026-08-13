import { NextRequest, NextResponse } from "next/server";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageEntitlements } from "@/lib/roles";
import { revokeEntitlement } from "@/lib/entitlements";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { revokeSchema } from "@/lib/validation";

/** Revoke a product from a customer (refund/abuse). Immediate effect (§9.2). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["staff", "admin"]);
    if (!canManageEntitlements(ctx.user))
      throw new HttpError(403, "Only Sales and Owner can revoke access");

    const { userId, productId } = revokeSchema.parse(await req.json());
    const ok = await revokeEntitlement(userId, productId);
    if (!ok) throw new HttpError(404, "Entitlement not found");

    await audit({
      actorId: ctx.user.id,
      action: "entitlement.revoke",
      targetType: "user",
      targetId: userId,
      metadata: { productId },
      ip: clientIp(req),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
