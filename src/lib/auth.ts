import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens, sessions, users, type User } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { isStaffLike } from "./roles";

export const SESSION_COOKIE = "portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const MAGIC_LINK_TTL_MS = 1000 * 60 * 15; // 15 minutes

// ---------------------------------------------------------------------------
// Magic-link tokens
// ---------------------------------------------------------------------------

/** Find or create a user by email, then mint a single-use login token. */
export async function createMagicLink(
  email: string,
  fullName?: string
): Promise<{ user: User; rawToken: string }> {
  const normalized = email.trim().toLowerCase();

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: normalized, fullName: fullName ?? null })
      .returning();
  } else if (fullName && !user.fullName) {
    [user] = await db
      .update(users)
      .set({ fullName })
      .where(eq(users.id, user.id))
      .returning();
  }

  const rawToken = randomToken();
  await db.insert(loginTokens).values({
    userId: user.id,
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });

  return { user, rawToken };
}

/** Consume a magic-link token (single use) and return the user, or null. */
export async function consumeMagicLink(rawToken: string): Promise<User | null> {
  const tokenHash = sha256(rawToken);
  const [token] = await db
    .select()
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.tokenHash, tokenHash),
        isNull(loginTokens.consumedAt),
        gt(loginTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!token) return null;

  await db
    .update(loginTokens)
    .set({ consumedAt: new Date() })
    .where(eq(loginTokens.id, token.id));

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1);

  if (!user || user.status === "disabled") return null;

  // An 'invited' user who logs in is now 'active'.
  if (user.status === "invited") {
    await db
      .update(users)
      .set({ status: "active" })
      .where(eq(users.id, user.id));
  }

  return user;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Create a server-side session and set the httpOnly cookie. Staff-like users
 * start with twoFactorPassed=false until they complete the TOTP step.
 */
export async function createSession(user: User): Promise<void> {
  const raw = randomToken();
  const twoFactorPassed = !isStaffLike(user); // customers need no 2FA

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: sha256(raw),
    twoFactorPassed,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function markSessionTwoFactorPassed(rawToken: string) {
  await db
    .update(sessions)
    .set({ twoFactorPassed: true })
    .where(eq(sessions.tokenHash, sha256(rawToken)));
}

export type SessionContext = {
  user: User;
  sessionId: string;
  rawToken: string;
  twoFactorPassed: boolean;
};

/** Read + validate the current session from the cookie. Returns null if none. */
export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, sha256(raw)),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.status === "disabled") return null;

  return {
    user,
    sessionId: session.id,
    rawToken: raw,
    twoFactorPassed: session.twoFactorPassed,
  };
}

/**
 * A session is fully authenticated when it exists AND, for staff-like users,
 * the TOTP step has been completed.
 */
export function isFullyAuthenticated(ctx: SessionContext): boolean {
  if (isStaffLike(ctx.user)) return ctx.twoFactorPassed;
  return true;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(raw)));
    jar.delete(SESSION_COOKIE);
  }
}
