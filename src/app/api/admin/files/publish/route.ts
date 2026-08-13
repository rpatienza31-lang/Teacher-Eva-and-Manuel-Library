import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, files, products, users } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageFiles } from "@/lib/roles";
import { validEntitlementSql } from "@/lib/entitlements";
import { loginUrl, sendWeekPublishedEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { publishWeekSchema } from "@/lib/validation";

/**
 * Publish all of week N for a product (SPEC §9.2, §9.3).
 *
 * Flips the week's files to published, then emails ONLY customers with an
 * active entitlement to that product — one email per customer (batched on the
 * publish action, never per individual file). Emails carry a login link and
 * never an attachment. Customers who opted out are skipped (they still see the
 * "New this week" flag in-app).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["editor", "admin"]);
    if (!canManageFiles(ctx.user))
      throw new HttpError(403, "Insufficient permissions");

    const { productId, weekNumber } = publishWeekSchema.parse(await req.json());

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new HttpError(404, "Product not found");

    const published = await db
      .update(files)
      .set({ isPublished: true })
      .where(
        and(eq(files.productId, productId), eq(files.weekNumber, weekNumber))
      )
      .returning({ id: files.id });

    if (published.length === 0)
      throw new HttpError(400, "No files uploaded for that week yet");

    await audit({
      actorId: ctx.user.id,
      action: "week.publish",
      targetType: "product",
      targetId: productId,
      metadata: { weekNumber, fileCount: published.length },
    });

    // Notify active-entitlement holders (only them), skipping opt-outs.
    const recipients = await db
      .select({ email: users.email })
      .from(entitlements)
      .innerJoin(users, eq(users.id, entitlements.userId))
      .where(
        and(
          eq(entitlements.productId, productId),
          eq(users.emailOptOut, false),
          validEntitlementSql()
        )
      );

    const link = loginUrl("/dashboard");
    let notified = 0;
    for (const r of recipients) {
      try {
        await sendWeekPublishedEmail({
          to: r.email,
          productTitle: product.title,
          weekNumber,
          link,
        });
        notified += 1;
      } catch (e) {
        console.error("week-published email failed for", r.email, e);
      }
    }

    return NextResponse.json({
      ok: true,
      publishedFiles: published.length,
      notified,
    });
  } catch (err) {
    return jsonError(err);
  }
}
