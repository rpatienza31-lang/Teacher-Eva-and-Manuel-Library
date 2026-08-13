import {
  bigint,
  boolean,
  index,
  inet,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Core domain model (SPEC §6, §7).
 *
 * A Product = one (term, grade, subject) tuple — the unit of purchase AND the
 * unit of access. A Product has many Files (tagged by week + type). An
 * Entitlement links one user to one product and is lifetime by default.
 */

// ---------------------------------------------------------------------------
// users — login identity + role set
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  fullName: text("full_name"),
  // customer | staff | editor | admin  (roles are additive)
  role: text("role").array().notNull().default(["customer"]),
  // active | invited | disabled
  status: text("status").notNull().default("active"),
  // TOTP 2FA — required for any account holding a staff/editor/admin role.
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  // customers may opt out of weekly-upload emails (still see in-app).
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// products — the (term, grade, subject) purchasable unit
// ---------------------------------------------------------------------------
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    term: smallint("term").notNull(),
    grade: smallint("grade").notNull(),
    subject: text("subject").notNull(),
    title: text("title").notNull(),
    code: text("code").unique().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    termGradeSubject: unique().on(t.term, t.grade, t.subject),
  })
);

// ---------------------------------------------------------------------------
// files — one uploaded artifact, tagged by week + type, private in object storage
// ---------------------------------------------------------------------------
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    weekNumber: smallint("week_number").notNull(), // 1..10
    fileType: text("file_type").notNull(), // docx | pdf | pptx | image
    displayName: text("display_name").notNull(),
    storageKey: text("storage_key").unique().notNull(), // object key in storage
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    isPublished: boolean("is_published").notNull().default(false),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    productWeek: index("files_product_week_idx").on(t.productId, t.weekNumber),
  })
);

// ---------------------------------------------------------------------------
// entitlements — user ↔ product access (lifetime by default)
// ---------------------------------------------------------------------------
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // active | revoked
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = no expiry
    source: text("source"), // manual | csv | pancake
    orderRef: text("order_ref"),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userProduct: unique().on(t.userId, t.productId),
  })
);

// ---------------------------------------------------------------------------
// download_logs — every download is logged (audit + anomaly detection)
// ---------------------------------------------------------------------------
export const downloadLogs = pgTable("download_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Auxiliary tables required by the implementation (not in the spec's §7 list
// but needed for magic-link auth, sessions, and the audit trail).
// ---------------------------------------------------------------------------

// login_tokens — single-use, short-lived magic-link tokens (hash stored).
export const loginTokens = pgTable("login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// sessions — server-side sessions referenced by an httpOnly cookie.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  // Staff sessions are not "trusted" until the TOTP step passes.
  twoFactorPassed: boolean("two_factor_passed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// audit_logs — logins, downloads, entitlement changes, admin actions (§10).
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(), // e.g. 'entitlement.grant'
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: text("metadata"), // JSON string
  ip: inet("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
