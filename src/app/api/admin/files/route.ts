import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { canManageFiles } from "@/lib/roles";
import { deleteObject } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { recordFileSchema } from "@/lib/validation";

/** List files for a product (staff-like read). */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["staff", "editor", "admin"]);
    const productId = req.nextUrl.searchParams.get("productId");
    if (!productId) throw new HttpError(400, "productId required");
    const rows = await db
      .select()
      .from(files)
      .where(eq(files.productId, productId))
      .orderBy(asc(files.weekNumber), asc(files.displayName));
    return NextResponse.json({ files: rows });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Record a file row after the browser finishes the direct-to-storage upload.
 * Files start UNPUBLISHED so a half-uploaded week is never visible (§9.2).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["editor", "admin"]);
    if (!canManageFiles(ctx.user))
      throw new HttpError(403, "Insufficient permissions");

    const data = recordFileSchema.parse(await req.json());
    const [row] = await db
      .insert(files)
      .values({
        productId: data.productId,
        weekNumber: data.weekNumber,
        fileType: data.fileType,
        displayName: data.displayName,
        storageKey: data.storageKey,
        sizeBytes: data.sizeBytes,
        isPublished: false,
        uploadedBy: ctx.user.id,
      })
      .returning();

    await audit({
      actorId: ctx.user.id,
      action: "file.record",
      targetType: "file",
      targetId: row.id,
    });
    return NextResponse.json({ file: row });
  } catch (err) {
    return jsonError(err);
  }
}

/** Delete a file (also removes the stored object). */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireRole(["editor", "admin"]);
    if (!canManageFiles(ctx.user))
      throw new HttpError(403, "Insufficient permissions");

    const fileId = req.nextUrl.searchParams.get("fileId");
    if (!fileId) throw new HttpError(400, "fileId required");

    const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    if (!row) throw new HttpError(404, "File not found");

    await deleteObject(row.storageKey).catch((e) =>
      console.error("storage delete failed (versioning retains it):", e)
    );
    await db.delete(files).where(eq(files.id, fileId));

    await audit({
      actorId: ctx.user.id,
      action: "file.delete",
      targetType: "file",
      targetId: fileId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
