import type { User } from "@/db/schema";

export type Role = "customer" | "staff" | "editor" | "admin";

export function hasRole(user: Pick<User, "role">, role: Role): boolean {
  return (user.role ?? []).includes(role);
}

export function hasAnyRole(user: Pick<User, "role">, roles: Role[]): boolean {
  return roles.some((r) => hasRole(user, r));
}

/** Any role beyond plain customer requires TOTP 2FA (SPEC §10). */
export function isStaffLike(user: Pick<User, "role">): boolean {
  return hasAnyRole(user, ["staff", "editor", "admin"]);
}

/** Only Owner (admin) + Sales (staff) may grant/revoke entitlements (§16.4). */
export function canManageEntitlements(user: Pick<User, "role">): boolean {
  return hasAnyRole(user, ["staff", "admin"]);
}

/** Editors, and admins, manage files/products. */
export function canManageFiles(user: Pick<User, "role">): boolean {
  return hasAnyRole(user, ["editor", "admin"]);
}

export function canManageStaff(user: Pick<User, "role">): boolean {
  return hasRole(user, "admin");
}
