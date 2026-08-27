import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { db } from "@/db";
import { downloadLogs, files, products } from "@/db/schema";
import { requireSession, jsonError, HttpError } from "@/lib/guards";
import { hasValidEntitlement } from "@/lib/entitlements";
import { getObjectBytes } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { audit } from "@/lib/audit";

/**
 * Bulk download (SPEC §8, §9.1): zip up the published files a customer is
 * entitled to and stream the archive.
 *
 *   1. session required
 *   2. entitlement re-checked SERVER-SIDE for this product
 *   3. gather published files (optionally a single ?week=N), pull their bytes
 *      from storage, and bundle into a .zip grouped by week
 *   4. log the download
 *
 * Bytes pass through this server (unlike single-file downloads, which redirect
 * to a presigned URL), so keep the scope to one product/week.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const ctx = await requireSession();
    const { productId } = await params;

    // Zips are heavier than single presigns — throttle harder.
    const limit = rateLimit(`download-zip:${ctx.user.id}`, 10, 60_000);
    if (!limit.ok) throw new HttpError(429, "Too many downloads, slow down");

    const entitled = await hasValidEntitlement(ctx.user.id, productId);
    if (!entitled) throw new HttpError(403, "Forbidden");

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new HttpError(404, "Not found");

    const weekParam = req.nextUrl.searchParams.get("week");
    const week = weekParam ? Number(weekParam) : null;
    if (weekParam && (!Number.isInteger(week) || week! < 1 || week! > 10))
      throw new HttpError(400, "Invalid week");

    const conditions = [
      eq(files.productId, productId),
      eq(files.isPublished, true),
    ];
    if (week) conditions.push(eq(files.weekNumber, week));

    const rows = await db
      .select()
      .from(files)
      .where(and(...conditions))
      .orderBy(asc(files.weekNumber), asc(files.displayName));

    if (rows.length === 0) throw new HttpError(404, "No files to download");

    // Bundle: files grouped into "Week 0X/" folders inside the archive.
    const zip = new JSZip();
    for (const f of rows) {
      const bytes = await getObjectBytes(f.storageKey);
      const folder = `Week ${String(f.weekNumber).padStart(2, "0")}`;
      zip.file(`${folder}/${safeName(f.displayName)}`, bytes);
    }
    const archive = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Log the bulk download (audit + anomaly detection).
    const ip = clientIp(req);
    for (const f of rows) {
      await db.insert(downloadLogs).values({
        userId: ctx.user.id,
        fileId: f.id,
        ip: ip ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      });
    }
    await audit({
      actorId: ctx.user.id,
      action: "file.download_zip",
      targetType: "product",
      targetId: productId,
      metadata: { week: week ?? "all", fileCount: rows.length },
      ip,
    });

    const label = week
      ? `${product.code}-week${String(week).padStart(2, "0")}`
      : `${product.code}-all`;

    return new NextResponse(Buffer.from(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName(label)}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

function safeName(name: string): string {
  return name.replace(/["\r\n\\/]/g, "_").slice(0, 200);
}
