import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST() {
  const ctx = await getSession();
  await destroySession();
  if (ctx) await audit({ actorId: ctx.user.id, action: "auth.logout" });
  return NextResponse.json({ ok: true });
}
