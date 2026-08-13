# Teacher Eva & Manuel — Client File-Access Portal

A web portal where customers log in and download **only** the lesson-plan files
(Word, PDF, images, PPT) for the grade / subject / term they purchased —
replacing Google Drive + email delivery (which breaks past ~500 emails/day).

Built with **Next.js 15 (App Router, TypeScript)**, **Drizzle + PostgreSQL**,
**S3-compatible object storage** (defaults to **Backblaze B2** — cheapest at
~$6/TB-month; Cloudflare R2 also works with a one-line config change) and
**Resend** for transactional email. Auth is passwordless **magic-link**, with
**TOTP 2FA required for all staff/admin accounts**.

---

## What's implemented (maps to the SPEC)

### Phase 1 — MVP
- **Schema + migrations** for every table in §7 (plus auxiliary `sessions`,
  `login_tokens`, `audit_logs`). See `src/db/schema.ts`, `drizzle/`.
- **Magic-link auth** + server-side sessions with role support; **TOTP 2FA
  required** before any staff-like session is trusted (`src/lib/auth.ts`,
  `src/lib/totp.ts`, `src/app/2fa`).
- **Storage wiring**: private bucket, presigned **PUT** (upload) and **GET**
  (download) helpers, provider-agnostic S3 (`src/lib/storage.ts`).
- **Admin**: create products; upload files (browser → storage direct) and
  **publish by week** (`src/app/admin`, `/api/admin/*`).
- **Admin**: real-time **grant / revoke** entitlements by email, multi-select
  subjects, sending the welcome/login email immediately on grant.
- **Customer**: My Products → weeks → download, with a **server-side
  entitlement re-check on every download** and full download logging.

### Phase 2 (included)
- **CSV import** for occasional batch grants (`/api/admin/import`).
- **Weekly-upload notifications**: publishing a week emails only active-
  entitlement holders of that product (opt-outs skipped), via Resend, no
  attachments — plus an in-app "New this week" badge.
- **Usage/audit**: `download_logs` + `audit_logs` capture logins, downloads,
  entitlement changes, and admin actions.

### Security (§10)
- Private storage bucket; **no public objects**; downloads only via ≤5-min presigned
  URLs. The app server never proxies file bytes.
- Entitlement re-checked server-side on **every** presign/download request.
- Per-user rate-limiting on downloads; per-IP on login-link requests; per-user
  on 2FA attempts (`src/lib/rate-limit.ts`).
- httpOnly + secure + sameSite session cookies; single-use, hashed magic-link
  tokens (raw tokens are never stored).
- All admin/API routes gated by server-side role checks (`src/lib/guards.ts`).
- Upload type + size validation before a PUT URL is issued (`src/lib/validation.ts`).
- Security headers in `next.config.mjs`. Secrets read server-side only.

> **Not built, by design:** in-app payments, dynamic watermarking (files stay
> byte-for-byte identical to the masters), Pancake auto-sync. See SPEC §4 & §16.

---

## Getting started

### 1. Prerequisites
- Node 20.6+ (uses `--env-file-if-exists`), a PostgreSQL database, an
  S3-compatible storage bucket (Backblaze B2 by default), and (optionally) a
  Resend account.
- **Database:** any Postgres host works — the app uses its own built-in
  magic-link auth, so it needs only a plain Postgres database, not Supabase's
  auth. A good **free** choice (no 2-project cap) is [Neon](https://neon.tech):
  create a project and paste its connection string into `DATABASE_URL`.

### 2. Configure
```bash
cp .env.example .env
# then fill in DATABASE_URL, AUTH_SECRET, STORAGE_*, RESEND_API_KEY, APP_URL
# generate a secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Leave `EMAIL_DRY_RUN=1` to print emails/links to the server console until
Resend + DNS (SPF/DKIM/DMARC) are configured.

### 3. Install & migrate
```bash
npm install
npm run db:migrate          # applies drizzle/*.sql
ADMIN_EMAIL=owner@example.com npm run db:seed   # super-admin + Term 2 catalog
```

### 4. Run
```bash
npm run dev                 # http://localhost:3000
```

- Go to `/login`, enter the seeded `ADMIN_EMAIL`. With `EMAIL_DRY_RUN=1` the
  magic link prints in the terminal — open it to log in.
- As a staff account you'll be sent to `/2fa` to enroll an authenticator, then
  to `/admin`.

### 5. Object storage setup (Backblaze B2 — cheapest)
- Create a **private** B2 bucket. Set `STORAGE_BUCKET` to its name.
- Note the bucket's **S3 endpoint** (shown in the B2 bucket details, e.g.
  `s3.us-west-004.backblazeb2.com`). Set `STORAGE_ENDPOINT` to
  `https://<that host>` and `STORAGE_REGION` to the region in it
  (`us-west-004`).
- Create an **application key** scoped to the bucket → set its `keyID` as
  `STORAGE_ACCESS_KEY_ID` and `applicationKey` as `STORAGE_SECRET_ACCESS_KEY`.
- Add the app's origin to the bucket **CORS** rules so browser PUT/GET works
  (allow `PUT, GET` from your `APP_URL` with the `Content-Type` header).
- Enable **object lock / versioning** for recoverability (§10).

**Free egress (recommended for a download-heavy portal):** B2 includes 3× your
stored volume in free egress each month; beyond that it bills $0.01/GB. To make
egress always free, front the bucket with **Cloudflare** (Bandwidth Alliance)
and set `STORAGE_PUBLIC_BASE_URL` to the Cloudflare host — download links are
then served through it at no egress cost.

**Prefer Cloudflare R2 instead?** R2 has $0 egress out of the box. Just set
`STORAGE_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`,
`STORAGE_REGION=auto`, and the R2 access keys — no other code changes.

---

## Architecture at a glance

```
Browser ──login──▶ /api/auth/request-link ──▶ Resend ──magic link──▶ /api/auth/callback ──▶ session cookie
Browser ─download▶ /api/download/[fileId] ──(session + entitlement check)──▶ 302 presigned GET ──▶ storage
Browser ──upload──▶ /api/admin/upload-url (presigned PUT) ──PUT bytes──▶ storage ; then /api/admin/files records the row
Publish ─────────▶ /api/admin/files/publish ──▶ email only active-entitlement holders (Resend, no attachment)
```

Files stream **directly** between the browser and object storage — never
through the app server — and the store returns the exact bytes uploaded (no
transcoding), so every download is byte-for-byte identical to the master.

### Key directories
| Path | What |
|---|---|
| `src/db/` | Drizzle schema, client, migrate + seed scripts |
| `src/lib/` | auth, storage, email, entitlements, roles, guards, validation, rate-limit |
| `src/app/api/` | route handlers (auth, download, admin) |
| `src/app/` | login, 2fa, dashboard, product view, admin console |
| `drizzle/` | generated SQL migrations |

---

## Acceptance-criteria mapping (§15)

| Criterion | Where |
|---|---|
| Customer sees only entitled products | `getDashboard`, `getProductForCustomer` |
| Non-entitled file → 403, no bytes | `/api/download/[fileId]` server check |
| Revoked entitlement blocks immediately | `validEntitlementSql` on every check |
| Files hidden until Publish | `is_published`, `/api/admin/files/publish` |
| Grant/revoke by email, immediate | `/api/admin/entitlements/*` |
| Downloads never proxy the app | 302 → presigned storage URL |
| CSV import with success/error summary | `/api/admin/import` |
| No file ever emailed as attachment | `src/lib/email.ts` (links only) |
| Byte-for-byte identical downloads | storage keeps exact bytes; no server rewrite |
| Only active-entitlement holders notified | `/api/admin/files/publish` recipient query |

---

## Production notes
- Host the app on Vercel; put Cloudflare (WAF + DDoS + bot mitigation) in front.
- The in-memory rate limiter is per-instance — swap for Redis/Cloudflare KV when
  running multiple instances.
- Configure SPF, DKIM and DMARC on the sending domain and warm up volume before
  the first big publish batch.
- Set up automated encrypted daily Postgres backups with a tested restore.
