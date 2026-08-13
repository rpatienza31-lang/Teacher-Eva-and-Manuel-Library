import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

/**
 * Cloudflare R2 wiring (SPEC §8).
 *
 * R2 is S3-compatible. The bucket is PRIVATE — no object is ever public.
 * Downloads use short-lived presigned GET URLs; uploads use presigned PUT URLs
 * so bytes stream browser ⇆ R2 and never pass through the app server. R2
 * returns the exact bytes uploaded (no transcoding), so files download
 * byte-for-byte identical to the master.
 */
const s3 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const PRESIGN_GET_TTL = 300; // ≤5 min (§8, §10)
const PRESIGN_PUT_TTL = 900; // uploads can take longer than a download click

/** Build the canonical R2 object key (SPEC §8 bucket layout). */
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
    Bucket: env.R2_BUCKET,
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
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_GET_TTL });
}

/** Presigned PUT — returned to an editor's browser to upload directly to R2. */
export async function presignUpload(
  storageKey: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_PUT_TTL });
}

export async function deleteObject(storageKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey })
  );
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
