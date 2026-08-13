import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isStaffLike } from "@/lib/roles";
import { getProductForCustomer } from "@/lib/customer-data";
import { TopBar } from "@/components/TopBar";
import { Badge, Card, fileTypeIcon, formatBytes } from "@/components/ui";

/** Product view: weeks 1–10 with published files + a Download button (§9.1). */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  if (isStaffLike(ctx.user) && !ctx.twoFactorPassed) redirect("/2fa");

  const { productId } = await params;
  const data = await getProductForCustomer(ctx.user.id, productId);

  // Not entitled (or revoked) → show a clear 403, never file contents (§9.1).
  if (!data) {
    return (
      <>
        <TopBar email={ctx.user.email} showAdmin={isStaffLike(ctx.user)} />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-6xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            You don&apos;t have access to this product
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            If you purchased it, please contact support.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-brand-600 hover:underline"
          >
            ← Back to My Products
          </Link>
        </main>
      </>
    );
  }

  const { product, byWeek, since } = data;
  const weeks = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <>
      <TopBar email={ctx.user.email} showAdmin={isStaffLike(ctx.user)} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← My Products
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {product.title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Grade {product.grade} · {product.subject} · Term {product.term}
        </p>

        <div className="mt-6 space-y-4">
          {weeks.map((w) => {
            const items = byWeek.get(w) ?? [];
            return (
              <Card key={w}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">Week {w}</h2>
                  {items.length === 0 && (
                    <span className="text-xs text-slate-400">
                      Not yet available
                    </span>
                  )}
                </div>
                {items.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {items.map((f) => {
                      const isNew =
                        f.uploadedAt != null && new Date(f.uploadedAt) >= since;
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">
                              {fileTypeIcon(f.fileType)}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-800">
                                {f.displayName}{" "}
                                {isNew && <Badge tone="blue">New</Badge>}
                              </p>
                              <p className="text-xs text-slate-400">
                                {f.fileType.toUpperCase()} ·{" "}
                                {formatBytes(f.sizeBytes)}
                              </p>
                            </div>
                          </div>
                          <a
                            href={`/api/download/${f.id}`}
                            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
                          >
                            Download
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
