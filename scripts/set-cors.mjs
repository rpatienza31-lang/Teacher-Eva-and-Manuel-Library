/**
 * Configure CORS on the Backblaze B2 (or S3-compatible) bucket so the browser
 * can upload files directly with a presigned PUT and download them back.
 *
 * Why this is needed: the app never streams file bytes through its own server
 * (SPEC §8) — the browser talks straight to object storage. A private bucket
 * rejects those cross-origin browser calls until an explicit CORS rule allows
 * the app's origin(s), which is what this script installs.
 *
 * Run once (loads credentials from .env):
 *   node --env-file-if-exists=.env scripts/set-cors.mjs
 *
 * Origins allowed default to http://localhost:3000 plus APP_URL. To set an
 * explicit list (e.g. after deploying), set STORAGE_CORS_ORIGINS to a
 * comma-separated list, e.g. "https://portal.example.com,http://localhost:3000".
 *
 * NOTE (Backblaze): setting bucket CORS requires a key with the "writeBuckets"
 * capability — normally the account's MASTER application key. A key restricted
 * to a single bucket usually cannot, and the script will report an
 * authorization error; run it once with the master key in that case.
 */

const keyId = process.env.STORAGE_ACCESS_KEY_ID;
const appKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const bucketName = process.env.STORAGE_BUCKET;

if (!keyId || !appKey || !bucketName) {
  console.error(
    "Missing STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY / STORAGE_BUCKET in .env"
  );
  process.exit(1);
}

const appUrl = process.env.APP_URL;
const origins = process.env.STORAGE_CORS_ORIGINS
  ? process.env.STORAGE_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : [
      "http://localhost:3000",
      ...(appUrl && appUrl !== "http://localhost:3000" ? [appUrl] : []),
    ];

async function b2(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" ? body.message || JSON.stringify(body) : body;
    throw new Error(`${res.status} ${res.statusText} — ${msg}`);
  }
  return body;
}

try {
  console.log("Authorizing with Backblaze…");
  const basic = Buffer.from(`${keyId}:${appKey}`).toString("base64");
  const auth = await b2("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
  });

  const apiUrl = auth.apiInfo.storageApi.apiUrl;
  const accountId = auth.accountId;
  const token = auth.authorizationToken;

  console.log(`Looking up bucket "${bucketName}"…`);
  const list = await b2(`${apiUrl}/b2api/v3/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, bucketName }),
  });
  const bucket = list.buckets && list.buckets[0];
  if (!bucket) throw new Error(`Bucket "${bucketName}" not found for this key.`);

  const corsRules = [
    {
      corsRuleName: "portal-browser-access",
      allowedOrigins: origins,
      allowedOperations: [
        "s3_put",
        "s3_get",
        "s3_head",
        "s3_post",
        "s3_delete",
        "b2_upload_file",
        "b2_upload_part",
        "b2_download_file_by_id",
        "b2_download_file_by_name",
      ],
      allowedHeaders: ["*"],
      exposeHeaders: ["etag", "x-amz-request-id"],
      maxAgeSeconds: 3600,
    },
  ];

  console.log(`Setting CORS for origins: ${origins.join(", ")}`);
  await b2(`${apiUrl}/b2api/v3/b2_update_bucket`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, bucketId: bucket.bucketId, corsRules }),
  });

  console.log(
    "\n✅ Done! CORS is configured. Refresh the app and try uploading again."
  );
} catch (err) {
  console.error(`\n❌ Failed to set CORS: ${err.message}`);
  console.error(
    "\nIf this says 'unauthorized' or mentions capabilities, the key in .env " +
      "is restricted. Re-run this once using your Backblaze MASTER application " +
      "key (Account → Application Keys), then switch .env back to the restricted key."
  );
  process.exit(1);
}
