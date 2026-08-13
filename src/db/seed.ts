import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { products, users } from "./schema";

/**
 * Seed a super-admin + the Term 2 product catalog (Grades 3–8, all subjects).
 * Usage:  ADMIN_EMAIL=owner@example.com npm run db:seed
 *
 * The admin has no password — they log in via magic link, then enroll TOTP.
 */
const SUBJECTS = [
  "Mathematics",
  "English",
  "Science",
  "Filipino",
  "Araling Panlipunan",
  "MAPEH",
  "Values Education",
  "TLE",
];
const GRADES = [3, 4, 5, 6, 7, 8];
const TERM = 2;

const SUBJECT_CODE: Record<string, string> = {
  Mathematics: "MATH",
  English: "ENG",
  Science: "SCI",
  Filipino: "FIL",
  "Araling Panlipunan": "AP",
  MAPEH: "MAPEH",
  "Values Education": "VE",
  TLE: "TLE",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const adminEmail = (process.env.ADMIN_EMAIL ?? "owner@example.com")
    .toLowerCase()
    .trim();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);
  if (!existing) {
    await db.insert(users).values({
      email: adminEmail,
      fullName: "Owner",
      role: ["admin", "staff", "editor"],
      status: "invited",
    });
    console.log(`Created super-admin: ${adminEmail}`);
  } else {
    await db
      .update(users)
      .set({ role: ["admin", "staff", "editor"] })
      .where(eq(users.id, existing.id));
    console.log(`Updated super-admin roles: ${adminEmail}`);
  }

  let created = 0;
  for (const grade of GRADES) {
    for (const subject of SUBJECTS) {
      const code = `T${TERM}-G${grade}-${SUBJECT_CODE[subject] ?? subject.slice(0, 4).toUpperCase()}`;
      const title = `Grade ${grade} ${subject} — Term ${TERM}`;
      await db
        .insert(products)
        .values({ term: TERM, grade, subject, title, code })
        .onConflictDoNothing();
      created += 1;
    }
  }
  console.log(`Seeded ${created} product rows (existing ones skipped).`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
