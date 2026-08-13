import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, products, users, type Product } from "@/db/schema";

/**
 * Entitlement logic (SPEC §6, §7).
 *
 * An entitlement is VALID when status='active' AND (expires_at IS NULL OR
 * expires_at > now()). Access is lifetime by default (expires_at stays null);
 * revocation flips status to 'revoked' and takes effect immediately.
 */

/** SQL predicate: this entitlement row is currently valid. */
export function validEntitlementSql() {
  return and(
    eq(entitlements.status, "active"),
    or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date()))
  );
}

/** Does `userId` currently have a valid entitlement to `productId`? */
export async function hasValidEntitlement(
  userId: string,
  productId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.productId, productId),
        validEntitlementSql()
      )
    )
    .limit(1);
  return !!row;
}

/** All products a customer is currently entitled to (valid entitlements). */
export async function entitledProducts(userId: string): Promise<
  (Product & { entitlementStatus: string; expiresAt: Date | null })[]
> {
  const rows = await db
    .select({
      product: products,
      status: entitlements.status,
      expiresAt: entitlements.expiresAt,
    })
    .from(entitlements)
    .innerJoin(products, eq(products.id, entitlements.productId))
    .where(eq(entitlements.userId, userId));

  return rows.map((r) => ({
    ...r.product,
    entitlementStatus: r.status,
    expiresAt: r.expiresAt,
  }));
}

/**
 * Grant a product to a customer identified by email (creating the user as
 * 'invited' if new). Idempotent per (user, product): re-granting a revoked
 * entitlement reactivates it. Returns whether the user was newly created.
 */
export async function grantEntitlement(opts: {
  email: string;
  fullName?: string;
  productId: string;
  grantedBy: string;
  source?: string;
  orderRef?: string;
}): Promise<{ userId: string; userCreated: boolean; email: string }> {
  const email = opts.email.trim().toLowerCase();

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let userCreated = false;

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        fullName: opts.fullName ?? null,
        status: "invited",
      })
      .returning();
    userCreated = true;
  } else if (opts.fullName && !user.fullName) {
    await db.update(users).set({ fullName: opts.fullName }).where(eq(users.id, user.id));
  }

  await db
    .insert(entitlements)
    .values({
      userId: user.id,
      productId: opts.productId,
      status: "active",
      source: opts.source ?? "manual",
      orderRef: opts.orderRef,
      grantedBy: opts.grantedBy,
    })
    .onConflictDoUpdate({
      target: [entitlements.userId, entitlements.productId],
      // Refund-then-rebuy: reactivate and refresh the grant metadata.
      set: {
        status: "active",
        source: opts.source ?? "manual",
        orderRef: opts.orderRef,
        grantedBy: opts.grantedBy,
        grantedAt: sql`now()`,
      },
    });

  return { userId: user.id, userCreated, email };
}

/** Revoke a product from a user (refund/chargeback/abuse). Immediate effect. */
export async function revokeEntitlement(
  userId: string,
  productId: string
): Promise<boolean> {
  const res = await db
    .update(entitlements)
    .set({ status: "revoked" })
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.productId, productId)
      )
    )
    .returning({ id: entitlements.id });
  return res.length > 0;
}
