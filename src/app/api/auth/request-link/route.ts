import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMagicLink } from "@/lib/auth";
import { magicLinkUrl, sendMagicLinkEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { emailSchema } from "@/lib/validation";

const bodySchema = z.object({ email: emailSchema });

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Throttle by IP to blunt enumeration / spam (§10).
  const limit = rateLimit(`request-link:${ip ?? "unknown"}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests, please wait a minute." },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  // Always respond 200 to avoid leaking which emails exist.
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const { user, rawToken } = await createMagicLink(parsed.data.email);
  await sendMagicLinkEmail(user.email, magicLinkUrl(rawToken));
  await audit({ actorId: user.id, action: "auth.magic_link_requested", ip });

  return NextResponse.json({ ok: true });
}
