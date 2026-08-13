import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, jsonError, HttpError } from "@/lib/guards";
import { audit } from "@/lib/audit";
import { emailSchema } from "@/lib/validation";

/** Staff management — super-admin only (SPEC §9.2). */
const schema = z.object({
  email: emailSchema,
  fullName: z.string().trim().max(200).optional(),
  roles: z.array(z.enum(["customer", "staff", "editor", "admin"])).min(1),
});

export async function GET() {
  try {
    await requireRole(["admin"]);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
        totpEnabled: users.totpEnabled,
      })
      .from(users);
    // Only show accounts that hold a staff-like role.
    const staff = rows.filter((r) =>
      (r.role ?? []).some((x) => x !== "customer")
    );
    return NextResponse.json({ staff });
  } catch (err) {
    return jsonError(err);
  }
}

/** Create/update a staff account with roles (invited until first login). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(["admin"]);
    const { email, fullName, roles } = schema.parse(await req.json());

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(users)
        .set({ role: roles, fullName: fullName ?? existing.fullName })
        .where(eq(users.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(users)
        .values({ email, fullName: fullName ?? null, role: roles, status: "invited" })
        .returning();
    }

    await audit({
      actorId: ctx.user.id,
      action: "staff.upsert",
      targetType: "user",
      targetId: row.id,
      metadata: { roles },
    });

    return NextResponse.json({
      staff: { id: row.id, email: row.email, role: row.role },
    });
  } catch (err) {
    return jsonError(err);
  }
}
