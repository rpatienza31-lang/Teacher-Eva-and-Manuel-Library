import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageFiles } from "@/lib/roles";
import { buildStorageKey, presignUpload, subjectSlug } from "@/lib/storage";
import { ALLOWED_CONTENT_TYPES, presignUploadSchema } from "@/lib/validation";

/**
 * Issue a presigned PUT so the browser uploads large files directly to storage
 * (SPEC §8) — the app server never handles the bytes. Type + size are
 * validated server-side before the URL is issued.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["editor", "admin"]);
    if (!canManageFiles(ctx.user))
      throw new HttpError(403, "Insufficient permissions");

    const { productId, weekNumber, filename, contentType } =
      presignUploadSchema.parse(await req.json());

    if (!(contentType in ALLOWED_CONTENT_TYPES))
      throw new HttpError(400, "Unsupported file type");

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new HttpError(404, "Product not found");

    const safeName = filename.replace(/[^\w.\-]+/g, "_");
    const storageKey = buildStorageKey({
      term: product.term,
      grade: product.grade,
      subjectSlug: subjectSlug(product.subject),
      week: weekNumber,
      filename: safeName,
    });

    const uploadUrl = await presignUpload(storageKey, contentType);
    return NextResponse.json({
      uploadUrl,
      storageKey,
      fileType: ALLOWED_CONTENT_TYPES[contentType],
    });
  } catch (err) {
    return jsonError(err);
  }
}
