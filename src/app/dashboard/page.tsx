import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";
import { getDashboard } from "@/lib/customer-data";
import { TopBar } from "@/components/TopBar";
import { Badge, Card } from "@/components/ui";

/** Customer "My Products" dashboard (SPEC §9.1). Shows only entitled products. */
export default async function DashboardPage() {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  if (isStaffLike(ctx.user) && !ctx.twoFactorPassed) redirect("/2fa");

  const items = await getDashboard(ctx.user.id);
  const active = items.filter((p) => p.entitlementStatus === "active");
  const revoked = items.filter((p) => p.entitlementStatus !== "active");

  return (
    <>
      <TopBar email={ctx.user.email} showAdmin={isStaffLike(ctx.user)} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">My Products</h1>
        <p className="mt-1 text-sm text-slate-500">
          Download the lesson plans and PPTs for what you purchased.
        </p>

        {items.length === 0 && (
          <Card className="mt-6">
            <p className="text-slate-600">
              You don&apos;t have any products yet. Once your purchase is
              processed, they&apos;ll appear here.
            </p>
          </Card>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => (
            <Link key={p.id} href={`/dashboard/products/${p.id}`}>
              <Card className="h-full transition hover:border-brand-500 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <h2 className="font-semibold text-slate-900">{p.title}</h2>
                  {p.newThisWeek > 0 && <Badge tone="blue">New this week</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Grade {p.grade} · {p.subject} · Term {p.term}
                </p>
                <p className="mt-4 text-sm text-slate-600">
                  {p.publishedFileCount} file
                  {p.publishedFileCount === 1 ? "" : "s"} available
                </p>
              </Card>
            </Link>
          ))}
        </div>

        {revoked.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              No longer active
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {revoked.map((p) => (
                <Card key={p.id} className="opacity-60">
                  <div className="flex items-start justify-between">
                    <h2 className="font-semibold text-slate-700">{p.title}</h2>
                    <Badge tone="red">Access ended</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Grade {p.grade} · {p.subject} · Term {p.term}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
