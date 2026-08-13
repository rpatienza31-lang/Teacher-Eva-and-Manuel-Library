import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, files, products } from "@/db/schema";
import { validEntitlementSql } from "./entitlements";

const NEW_WINDOW_DAYS = 7;

export type DashboardProduct = {
  id: string;
  title: string;
  code: string;
  term: number;
  grade: number;
  subject: string;
  entitlementStatus: string;
  expiresAt: Date | null;
  publishedFileCount: number;
  newThisWeek: number;
};

/** Products for the customer's dashboard, with published-file + "new" counts. */
export async function getDashboard(userId: string): Promise<DashboardProduct[]> {
  const since = new Date(Date.now() - NEW_WINDOW_DAYS * 86400_000);

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      code: products.code,
      term: products.term,
      grade: products.grade,
      subject: products.subject,
      status: entitlements.status,
      expiresAt: entitlements.expiresAt,
      publishedFileCount: sql<number>`count(${files.id}) filter (where ${files.isPublished})`,
      newThisWeek: sql<number>`count(${files.id}) filter (where ${files.isPublished} and ${files.uploadedAt} >= ${since})`,
    })
    .from(entitlements)
    .innerJoin(products, eq(products.id, entitlements.productId))
    .leftJoin(files, eq(files.productId, products.id))
    .where(eq(entitlements.userId, userId))
    .groupBy(
      products.id,
      entitlements.status,
      entitlements.expiresAt
    )
    .orderBy(products.grade, products.subject);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    code: r.code,
    term: r.term,
    grade: r.grade,
    subject: r.subject,
    entitlementStatus: r.status,
    expiresAt: r.expiresAt,
    publishedFileCount: Number(r.publishedFileCount),
    newThisWeek: Number(r.newThisWeek),
  }));
}

/**
 * Published files for one product IF the user is entitled. Returns null when
 * the user has no valid entitlement (caller renders 403). Grouped by week.
 */
export async function getProductForCustomer(userId: string, productId: string) {
  const [ent] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.productId, productId),
        validEntitlementSql()
      )
    )
    .limit(1);

  if (!ent) return null;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return null;

  const publishedFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.productId, productId), eq(files.isPublished, true)))
    .orderBy(files.weekNumber, files.displayName);

  const since = new Date(Date.now() - NEW_WINDOW_DAYS * 86400_000);
  const byWeek = new Map<number, typeof publishedFiles>();
  for (const f of publishedFiles) {
    const arr = byWeek.get(f.weekNumber) ?? [];
    arr.push(f);
    byWeek.set(f.weekNumber, arr);
  }

  return { product, byWeek, since };
}

// Kept for potential future use (recent published files across all products).
export async function recentlyPublished(userId: string) {
  const since = new Date(Date.now() - NEW_WINDOW_DAYS * 86400_000);
  return db
    .select({
      fileId: files.id,
      displayName: files.displayName,
      productTitle: products.title,
      productId: products.id,
      uploadedAt: files.uploadedAt,
    })
    .from(files)
    .innerJoin(products, eq(products.id, files.productId))
    .innerJoin(
      entitlements,
      and(
        eq(entitlements.productId, products.id),
        eq(entitlements.userId, userId),
        validEntitlementSql()
      )
    )
    .where(and(eq(files.isPublished, true), gte(files.uploadedAt, since)))
    .orderBy(desc(files.uploadedAt))
    .limit(20);
}
