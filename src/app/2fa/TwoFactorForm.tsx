"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TwoFactorForm({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(!enrolled);

  async function startSetup() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Setup failed");
    setQr(data.qr);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const endpoint = enrolling ? "/api/auth/2fa/enable" : "/api/auth/2fa/verify";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Verification failed");
    router.push("/admin");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">
        Two-factor authentication
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Staff accounts require an authenticator app (TOTP).
      </p>

      {enrolling && !qr && (
        <div className="mt-6">
          <p className="text-sm text-slate-600">
            You haven&apos;t set up 2FA yet. Generate your QR code to enroll.
          </p>
          <button
            onClick={startSetup}
            disabled={loading}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Generating…" : "Set up authenticator"}
          </button>
        </div>
      )}

      {qr && (
        <div className="mt-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Scan with your authenticator app" className="mx-auto h-44 w-44" />
          <p className="mt-2 text-xs text-slate-500">
            Scan with Google Authenticator, Authy, 1Password, etc. Then enter a
            code below.
          </p>
        </div>
      )}

      {(qr || !enrolling) && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Verifying…" : enrolling ? "Confirm & enable" : "Verify"}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
