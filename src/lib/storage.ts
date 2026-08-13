import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

/**
 * Object storage (SPEC §8) — provider-agnostic, S3-compatible.
 *
 * Configured by default for **Backblaze B2** (cheapest storage, ~$6/TB-month)
 * but works unchanged with Cloudflare R2 or any S3-compatible store: just set
 * STORAGE_ENDPOINT / STORAGE_REGION / STORAGE_BUCKET and the access keys.
 *
 * The bucket is PRIVATE — no object is ever public. Downloads use short-lived
 * presigned GET URLs; uploads use presigned PUT URLs so bytes stream
 * browser ⇆ storage and never pass through the app server. The store returns
 * the exact bytes uploaded (no transcoding), so files download byte-for-byte
 * identical to the master.
 *
 * Egress note (B2): Backblaze bills egress above 3× your stored volume/month.
 * For a download-heavy portal, front the bucket with Cloudflare (Bandwidth
 * Alliance = free egress) and set STORAGE_PUBLIC_BASE_URL to the Cloudflare
 * host so presigned links are served through it. Left unset, links go straight
 * to the storage endpoint. R2 has $0 egress and needs none of this.
 */
const s3 = new S3Client({
  region: env.STORAGE_REGION || "auto",
  endpoint: env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
});

const PRESIGN_GET_TTL = 300; // ≤5 min (§8, §10)
const PRESIGN_PUT_TTL = 900; // uploads can take longer than a download click

/** Build the canonical object key (SPEC §8 bucket layout). */
export function buildStorageKey(opts: {
  term: number;
  grade: number;
  subjectSlug: string;
  week: number;
  filename: string;
}): string {
  const week = String(opts.week).padStart(2, "0");
  return `t${opts.term}/g${opts.grade}/${opts.subjectSlug}/week${week}/${opts.filename}`;
}

/** Presigned GET — returned to an entitled customer to download a file. */
export async function presignDownload(
  storageKey: string,
  downloadName?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: storageKey,
    // Force a browser download with the friendly name.
    ...(downloadName
      ? {
          ResponseContentDisposition: `attachment; filename="${sanitizeFilename(
            downloadName
          )}"`,
        }
      : {}),
  });
  const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_GET_TTL });
  return rewriteToPublicBase(url);
}

/** Presigned PUT — returned to an editor's browser to upload directly. */
export async function presignUpload(
  storageKey: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_PUT_TTL });
}

export async function deleteObject(storageKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: storageKey })
  );
}

/**
 * If a CDN/custom domain is configured (e.g. Cloudflare in front of B2 for free
 * egress), swap the presigned URL's host to it. The S3 signature covers the
 * path + query, not the host, so this is safe as long as the CDN forwards the
 * request unchanged to the same storage endpoint.
 */
function rewriteToPublicBase(url: string): string {
  const base = env.STORAGE_PUBLIC_BASE_URL;
  if (!base) return url;
  const signed = new URL(url);
  const target = new URL(base);
  target.pathname = signed.pathname;
  target.search = signed.search;
  return target.toString();
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "").slice(0, 200);
}

export function subjectSlug(subject: string): string {
  return subject
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
