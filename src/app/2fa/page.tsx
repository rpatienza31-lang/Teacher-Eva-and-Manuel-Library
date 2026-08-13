import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";
import TwoFactorForm from "./TwoFactorForm";

/**
 * Staff 2FA step. Non-staff never reach here. If already 2FA-passed, go on.
 * If not yet enrolled, the form runs the enrollment flow (QR + confirm).
 */
export default async function TwoFactorPage() {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  if (!isStaffLike(ctx.user)) redirect("/dashboard");
  if (ctx.twoFactorPassed) redirect("/admin");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <TwoFactorForm enrolled={ctx.user.totpEnabled} />
    </main>
  );
}
