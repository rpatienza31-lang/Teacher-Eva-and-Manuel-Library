import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloadLogs, files } from "@/db/schema";
import { requireSession, jsonError, HttpError } from "@/lib/guards";
import { hasValidEntitlement } from "@/lib/entitlements";
import { presignDownload } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { audit } from "@/lib/audit";

/**
 * Download endpoint (SPEC §8, §10 — the security core).
 *
 *   1. session required
 *   2. entitlement re-checked SERVER-SIDE for this file's product
 *   3. issue a ≤5-min presigned GET URL
 *   4. log the download
 *   5. 302 redirect — bytes stream storage → customer, never through this server
 *
 * A non-entitled file returns 403 and NO bytes.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const ctx = await requireSession();
    const { fileId } = await params;

    // Rate-limit presign requests per user to blunt scraping/link-sharing.
    const limit = rateLimit(`download:${ctx.user.id}`, 60, 60_000);
    if (!limit.ok) throw new HttpError(429, "Too many downloads, slow down");

    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    // Never reveal existence of non-entitled / unpublished files.
    if (!file || !file.isPublished) throw new HttpError(403, "Forbidden");

    const entitled = await hasValidEntitlement(ctx.user.id, file.productId);
    if (!entitled) throw new HttpError(403, "Forbidden");

    const url = await presignDownload(file.storageKey, file.displayName);

    // Log every download (audit + anomaly detection).
    const ip = clientIp(req);
    await db.insert(downloadLogs).values({
      userId: ctx.user.id,
      fileId: file.id,
      ip: ip ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await audit({
      actorId: ctx.user.id,
      action: "file.download",
      targetType: "file",
      targetId: file.id,
      ip,
    });

    return NextResponse.redirect(url, 302);
  } catch (err) {
    return jsonError(err);
  }
}
