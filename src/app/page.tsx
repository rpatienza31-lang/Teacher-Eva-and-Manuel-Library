import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";

export default async function Home() {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  if (isStaffLike(ctx.user) && !ctx.twoFactorPassed) redirect("/2fa");
  redirect("/dashboard");
}
