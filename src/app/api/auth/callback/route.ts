import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLink, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { isStaffLike } from "@/lib/roles";
import { env } from "@/lib/env";

/**
 * Magic-link callback: consume the token, open a session, redirect.
 * Staff-like users land on the 2FA step first (session not yet trusted).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid", env.APP_URL));
  }

  const user = await consumeMagicLink(token);
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=expired", env.APP_URL));
  }

  await createSession(user);
  await audit({
    actorId: user.id,
    action: "auth.login",
    ip: clientIp(req),
  });

  const dest = isStaffLike(user) ? "/2fa" : "/dashboard";
  return NextResponse.redirect(new URL(dest, env.APP_URL));
}
