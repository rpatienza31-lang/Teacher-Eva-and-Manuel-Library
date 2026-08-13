import { redirect } from "next/navigation";
import { getSession, isFullyAuthenticated } from "@/lib/auth";
import { isStaffLike, canManageEntitlements, canManageFiles, canManageStaff } from "@/lib/roles";
import { TopBar } from "@/components/TopBar";
import AdminConsole from "./AdminConsole";

/** Admin console (SPEC §9.2). Staff-like + 2FA required to reach it. */
export default async function AdminPage() {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  if (!isStaffLike(ctx.user)) redirect("/dashboard");
  if (!isFullyAuthenticated(ctx)) redirect("/2fa");

  const perms = {
    entitlements: canManageEntitlements(ctx.user),
    files: canManageFiles(ctx.user),
    staff: canManageStaff(ctx.user),
  };

  return (
    <>
      <TopBar email={ctx.user.email} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Staff Console</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as {ctx.user.email} · roles: {ctx.user.role.join(", ")}
        </p>
        <AdminConsole perms={perms} />
      </main>
    </>
  );
}
