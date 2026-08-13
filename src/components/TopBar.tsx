"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export function TopBar({
  email,
  showAdmin,
}: {
  email: string;
  showAdmin?: boolean;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="font-bold text-slate-900">
          Teacher Eva &amp; Manuel
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {showAdmin && (
            <Link href="/admin" className="text-brand-600 hover:underline">
              Admin
            </Link>
          )}
          <span className="hidden text-slate-500 sm:inline">{email}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
