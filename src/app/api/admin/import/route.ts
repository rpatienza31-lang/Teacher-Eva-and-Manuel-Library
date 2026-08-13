import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageEntitlements } from "@/lib/roles";
import { grantEntitlement } from "@/lib/entitlements";
import { audit } from "@/lib/audit";
import { emailSchema, gradeSchema, termSchema } from "@/lib/validation";

/**
 * Optional CSV bulk import (SPEC §9.2 — NOT the main path). Columns:
 *   email, full_name, term, grade, subject, order_ref
 * One row per subject. Creates invited users + active entitlements and returns
 * an accurate success/error summary. Day-to-day is the real-time grant.
 */
type RowResult = { row: number; email?: string; error?: string };

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["staff", "admin"]);
    if (!canManageEntitlements(ctx.user))
      throw new HttpError(403, "Only Sales and Owner can import");

    const { csv } = (await req.json()) as { csv?: string };
    if (!csv || typeof csv !== "string")
      throw new HttpError(400, "csv (string) required");

    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    const results: RowResult[] = [];
    let success = 0;

    for (let i = 0; i < parsed.data.length; i++) {
      const raw = parsed.data[i];
      const rowNo = i + 2; // account for header row
      try {
        const email = emailSchema.parse(raw.email);
        const term = termSchema.parse(raw.term);
        const grade = gradeSchema.parse(raw.grade);
        const subject = (raw.subject ?? "").trim();
        if (!subject) throw new Error("subject is required");

        const [product] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.term, term),
              eq(products.grade, grade),
              eq(products.subject, subject)
            )
          )
          .limit(1);
        if (!product)
          throw new Error(
            `no product for term ${term}, grade ${grade}, ${subject}`
          );

        await grantEntitlement({
          email,
          fullName: raw.full_name?.trim() || undefined,
          productId: product.id,
          grantedBy: ctx.user.id,
          source: "csv",
          orderRef: raw.order_ref?.trim() || undefined,
        });

        results.push({ row: rowNo, email });
        success += 1;
      } catch (e) {
        results.push({
          row: rowNo,
          email: raw.email,
          error: e instanceof Error ? e.message : "invalid row",
        });
      }
    }

    await audit({
      actorId: ctx.user.id,
      action: "entitlement.csv_import",
      metadata: { total: parsed.data.length, success },
    });

    return NextResponse.json({
      total: parsed.data.length,
      success,
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (err) {
    return jsonError(err);
  }
}
