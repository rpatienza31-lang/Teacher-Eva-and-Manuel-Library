import { NextResponse } from "next/server";
import {
  getSession,
  isFullyAuthenticated,
  type SessionContext,
} from "./auth";
import { hasAnyRole, type Role } from "./roles";

/**
 * Server-side guards for API routes. Every admin/API route is gated here —
 * we NEVER trust the client to hide a button (SPEC §5, §10).
 */

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Require a logged-in, fully-authenticated (2FA-complete) session. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSession();
  if (!ctx) throw new HttpError(401, "Not authenticated");
  if (!isFullyAuthenticated(ctx))
    throw new HttpError(403, "Two-factor authentication required");
  return ctx;
}

/** Require a session holding at least one of the given roles. */
export async function requireRole(roles: Role[]): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!hasAnyRole(ctx.user, roles))
    throw new HttpError(403, "Insufficient permissions");
  return ctx;
}

/** Wrap an API handler so thrown HttpErrors become clean JSON responses. */
export function jsonError(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("Unhandled API error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
