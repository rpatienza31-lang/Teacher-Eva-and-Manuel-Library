import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageFiles } from "@/lib/roles";
import { audit } from "@/lib/audit";
import { createProductSchema } from "@/lib/validation";

/** List all products (any staff-like role may read). */
export async function GET() {
  try {
    await requireRole(["staff", "editor", "admin"]);
    const rows = await db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt));
    return NextResponse.json({ products: rows });
  } catch (err) {
    return jsonError(err);
  }
}

/** Create a product (editor/admin). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["editor", "admin"]);
    if (!canManageFiles(ctx.user))
      throw new HttpError(403, "Insufficient permissions");

    const data = createProductSchema.parse(await req.json());
    const [row] = await db
      .insert(products)
      .values({
        term: data.term,
        grade: data.grade,
        subject: data.subject,
        title: data.title,
        code: data.code.toUpperCase(),
      })
      .returning();

    await audit({
      actorId: ctx.user.id,
      action: "product.create",
      targetType: "product",
      targetId: row.id,
      metadata: { code: row.code },
    });

    return NextResponse.json({ product: row });
  } catch (err) {
    // Surface unique-constraint clashes clearly.
    if (err instanceof Error && /duplicate key|unique/i.test(err.message)) {
      return NextResponse.json(
        { error: "A product with that code or (term, grade, subject) already exists" },
        { status: 409 }
      );
    }
    return jsonError(err);
  }
}
