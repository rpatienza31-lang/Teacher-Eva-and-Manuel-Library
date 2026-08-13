import { NextRequest, NextResponse } from "next/server";
import { desc, ilike, or, eq } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, products, users } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";

/**
 * Customer lookup (SPEC §9.2). `?q=` filters by email/name; `?userId=`
 * returns a single customer with their entitlements.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["staff", "admin"]);
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const userId = req.nextUrl.searchParams.get("userId");

    if (userId) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw new HttpError(404, "Customer not found");

      const ents = await db
        .select({
          entitlementId: entitlements.id,
          productId: products.id,
          title: products.title,
          code: products.code,
          status: entitlements.status,
          expiresAt: entitlements.expiresAt,
          orderRef: entitlements.orderRef,
          grantedAt: entitlements.grantedAt,
        })
        .from(entitlements)
        .innerJoin(products, eq(products.id, entitlements.productId))
        .where(eq(entitlements.userId, userId));

      return NextResponse.json({ user, entitlements: ents });
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        q
          ? or(ilike(users.email, `%${q}%`), ilike(users.fullName, `%${q}%`))
          : undefined
      )
      .orderBy(desc(users.createdAt))
      .limit(50);

    return NextResponse.json({ customers: rows });
  } catch (err) {
    return jsonError(err);
  }
}
