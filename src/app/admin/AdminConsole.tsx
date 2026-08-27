"use client";

import { useCallback, useEffect, useState } from "react";

type Perms = { entitlements: boolean; files: boolean; staff: boolean };
type Product = {
  id: string;
  term: number;
  grade: number;
  subject: string;
  title: string;
  code: string;
  isActive: boolean;
};

const tabList = (perms: Perms) =>
  [
    perms.entitlements && { id: "grant", label: "Grant access" },
    perms.files && { id: "products", label: "Products" },
    perms.files && { id: "files", label: "Upload & publish" },
    perms.entitlements && { id: "customers", label: "Customers" },
    perms.entitlements && { id: "import", label: "CSV import" },
    perms.staff && { id: "staff", label: "Staff" },
  ].filter(Boolean) as { id: string; label: string }[];

export default function AdminConsole({ perms }: { perms: Perms }) {
  const tabs = tabList(perms);
  const [tab, setTab] = useState(tabs[0]?.id ?? "grant");
  const [products, setProducts] = useState<Product[]>([]);

  const loadProducts = useCallback(async () => {
    const res = await fetch("/api/admin/products");
    if (res.ok) setProducts((await res.json()).products);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "grant" && <GrantTab products={products} />}
        {tab === "products" && (
          <ProductsTab products={products} onChange={loadProducts} />
        )}
        {tab === "files" && <FilesTab products={products} />}
        {tab === "customers" && <CustomersTab products={products} />}
        {tab === "import" && <ImportTab />}
        {tab === "staff" && <StaffTab />}
      </div>
    </div>
  );
}

function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div
      className={`mt-4 rounded-lg p-3 text-sm ${
        msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
      }`}
    >
      {msg.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grant access — the core daily workflow
// ---------------------------------------------------------------------------
function GrantTab({ products }: { products: Product[] }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function grant() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/entitlements/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        fullName: fullName || undefined,
        orderRef: orderRef || undefined,
        productIds: [...selected],
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Grant failed" });
    setMsg({
      ok: true,
      text: `Access granted to ${email}. Welcome email sent${
        data.userCreated ? " (new account created)" : ""
      }.`,
    });
    setEmail("");
    setFullName("");
    setOrderRef("");
    setSelected(new Set());
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-slate-500">
        As sales close in chat, grant the buyer access. They get a welcome email
        with a login link and can download within seconds.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          placeholder="Buyer email *"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Pancake order ref (optional)"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
      </div>

      <p className="mt-4 text-sm font-medium text-slate-700">
        Products purchased (multi-select)
      </p>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {products.length === 0 && (
          <p className="p-2 text-sm text-slate-400">No products yet.</p>
        )}
        {products.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
            />
            {p.title}{" "}
            <span className="text-xs text-slate-400">({p.code})</span>
          </label>
        ))}
      </div>

      <button
        onClick={grant}
        disabled={busy || !email || selected.size === 0}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "Granting…" : `Grant ${selected.size} product(s)`}
      </button>
      <Notice msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
function ProductsTab({
  products,
  onChange,
}: {
  products: Product[];
  onChange: () => void;
}) {
  const [form, setForm] = useState({
    term: "2",
    grade: "3",
    subject: "Mathematics",
    title: "",
    code: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    setMsg(null);
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Failed" });
    setMsg({ ok: true, text: `Created ${data.product.title}` });
    setForm({ ...form, title: "", code: "" });
    onChange();
  }

  return (
    <div>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <input
          placeholder="Term"
          value={form.term}
          onChange={(e) => setForm({ ...form, term: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Grade"
          value={form.grade}
          onChange={(e) => setForm({ ...form, grade: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Title, e.g. Grade 3 Mathematics — Term 2"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          placeholder="Code, e.g. T2-G3-MATH"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={create}
        disabled={!form.title || !form.code}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Create product
      </button>
      <Notice msg={msg} />

      <table className="mt-6 w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-400">
          <tr>
            <th className="py-2">Title</th>
            <th>Code</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="py-2">{p.title}</td>
              <td className="text-slate-500">{p.code}</td>
              <td>{p.isActive ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload & publish
// ---------------------------------------------------------------------------
type FileRow = {
  id: string;
  weekNumber: number;
  fileType: string;
  displayName: string;
  isPublished: boolean;
  sizeBytes: number | null;
};

// Map file extension -> content type. Folder uploads often report an empty
// file.type, so we resolve from the extension (and must send the SAME value in
// both the presign request and the PUT header, or the signature won't match).
const EXT_CONTENT_TYPE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function resolveContentType(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_CONTENT_TYPE[ext]) return EXT_CONTENT_TYPE[ext];
  const allowed = new Set(Object.values(EXT_CONTENT_TYPE));
  return allowed.has(file.type) ? file.type : null;
}

function FilesTab({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState("");
  const [week, setWeek] = useState("1");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    const res = await fetch(`/api/admin/files?productId=${productId}`);
    if (res.ok) setFiles((await res.json()).files);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(list: FileList | null) {
    if (!list || !productId) return;

    // A folder pick brings along junk (.DS_Store, hidden/system files) and
    // unsupported types — keep only real, allowed files so they don't error.
    const candidates = Array.from(list)
      .filter((f) => !f.name.startsWith(".") && f.size > 0)
      .map((f) => ({ file: f, contentType: resolveContentType(f) }))
      .filter(
        (c): c is { file: File; contentType: string } => c.contentType !== null
      );

    if (candidates.length === 0) {
      setMsg({
        ok: false,
        text: "No supported files found (Word, PPT, PDF, or images).",
      });
      return;
    }

    setUploading(true);
    setMsg(null);
    let ok = 0;
    let failed = 0;
    for (const { file, contentType } of candidates) {
      try {
        const presign = await fetch("/api/admin/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            weekNumber: Number(week),
            filename: file.name,
            contentType,
            sizeBytes: file.size,
          }),
        });
        const pd = await presign.json();
        if (!presign.ok) throw new Error(pd.error);

        // Direct browser → storage PUT (bytes never touch the app server).
        const put = await fetch(pd.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!put.ok) throw new Error("Storage upload failed");

        const rec = await fetch("/api/admin/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            weekNumber: Number(week),
            storageKey: pd.storageKey,
            displayName: file.name,
            fileType: pd.fileType,
            sizeBytes: file.size,
          }),
        });
        if (!rec.ok) throw new Error("record failed");
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    setMsg({
      ok: ok > 0,
      text: `${ok} file(s) uploaded${
        failed ? `, ${failed} failed` : ""
      } (unpublished).`,
    });
    load();
  }

  async function publish() {
    setMsg(null);
    const res = await fetch("/api/admin/files/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, weekNumber: Number(week) }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Failed" });
    setMsg({
      ok: true,
      text: `Published ${data.publishedFiles} file(s). Notified ${data.notified} customer(s).`,
    });
    load();
  }

  async function del(fileId: string) {
    await fetch(`/api/admin/files?fileId=${fileId}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

      {productId && (
        <>
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-sm text-slate-600">
              <span className="mr-2 font-medium">Choose files:</span>
              <input
                type="file"
                multiple
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files)}
                className="text-sm"
                accept=".docx,.pdf,.pptx,.png,.jpg,.jpeg,.webp,.gif"
              />
            </label>
            <label className="text-sm text-slate-600">
              <span className="mr-2 font-medium">…or a whole folder:</span>
              <input
                type="file"
                multiple
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files)}
                className="text-sm"
                {...({ webkitdirectory: "", directory: "" } as unknown as Record<string, unknown>)}
              />
            </label>
            <p className="text-xs text-slate-400">
              Everything inside the folder uploads to {`Week ${week}`} of the
              selected product. Unsupported files and hidden system files are
              skipped automatically.
            </p>
            {uploading && (
              <span className="text-sm text-slate-500">Uploading…</span>
            )}
          </div>

          <button
            onClick={publish}
            className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Publish all of Week {week}
          </button>
          <Notice msg={msg} />

          <table className="mt-6 w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">File</th>
                <th>Week</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="py-2">{f.displayName}</td>
                  <td>{f.weekNumber}</td>
                  <td className="uppercase text-slate-500">{f.fileType}</td>
                  <td>
                    {f.isPublished ? (
                      <span className="text-green-700">Published</span>
                    ) : (
                      <span className="text-amber-600">Draft</span>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => del(f.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
type CustomerRow = { id: string; email: string; fullName: string | null; status: string };
type EntRow = {
  productId: string;
  title: string;
  status: string;
  orderRef: string | null;
};

function CustomersTab({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [sel, setSel] = useState<CustomerRow | null>(null);
  const [ents, setEnts] = useState<EntRow[]>([]);

  async function search() {
    const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`);
    if (res.ok) setRows((await res.json()).customers);
  }

  async function open(c: CustomerRow) {
    setSel(c);
    const res = await fetch(`/api/admin/customers?userId=${c.id}`);
    if (res.ok) setEnts((await res.json()).entitlements);
  }

  async function revoke(productId: string) {
    if (!sel) return;
    await fetch("/api/admin/entitlements/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: sel.id, productId }),
    });
    open(sel);
  }

  void products;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="flex gap-2">
          <input
            placeholder="Search email or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={search}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Search
          </button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => open(c)}
                className="w-full py-2 text-left text-sm hover:text-brand-700"
              >
                {c.email}{" "}
                <span className="text-xs text-slate-400">({c.status})</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {sel && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800">{sel.email}</h3>
          <p className="text-xs text-slate-400">{sel.fullName}</p>
          <ul className="mt-3 space-y-2">
            {ents.map((e) => (
              <li
                key={e.productId}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {e.title}{" "}
                  <span
                    className={
                      e.status === "active"
                        ? "text-green-700"
                        : "text-red-600"
                    }
                  >
                    ({e.status})
                  </span>
                </span>
                {e.status === "active" && (
                  <button
                    onClick={() => revoke(e.productId)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
            {ents.length === 0 && (
              <li className="text-sm text-slate-400">No entitlements.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------
function ImportTab() {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{
    total: number;
    success: number;
    failed: number;
    results: { row: number; email?: string; error?: string }[];
  } | null>(null);

  async function run() {
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    if (res.ok) setResult(await res.json());
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-slate-500">
        Optional bulk import (not the main path). Columns:{" "}
        <code className="text-xs">email, full_name, term, grade, subject, order_ref</code>{" "}
        — one row per subject.
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={8}
        placeholder="email,full_name,term,grade,subject,order_ref&#10;jane@x.com,Jane,2,3,Mathematics,PC-1001"
        className="mt-3 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
      />
      <button
        onClick={run}
        disabled={!csv.trim()}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Import
      </button>
      {result && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p>
            {result.success} succeeded, {result.failed} failed of {result.total}.
          </p>
          {result.results
            .filter((r) => r.error)
            .map((r) => (
              <p key={r.row} className="mt-1 text-xs text-red-600">
                Row {r.row} ({r.email}): {r.error}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff (super-admin)
// ---------------------------------------------------------------------------
function StaffTab() {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Set<string>>(new Set(["staff"]));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(r: string) {
    const next = new Set(roles);
    next.has(r) ? next.delete(r) : next.add(r);
    setRoles(next);
  }

  async function save() {
    setMsg(null);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, roles: [...roles] }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Failed" });
    setMsg({ ok: true, text: `Saved ${data.staff.email}` });
    setEmail("");
  }

  return (
    <div className="max-w-lg">
      <p className="text-sm text-slate-500">
        Add or update a staff account and assign roles. They enroll 2FA on first
        login.
      </p>
      <input
        placeholder="staff email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {["staff", "editor", "admin"].map((r) => (
          <label key={r} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={roles.has(r)}
              onChange={() => toggle(r)}
            />
            {r}
          </label>
        ))}
      </div>
      <button
        onClick={save}
        disabled={!email || roles.size === 0}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Save staff
      </button>
      <Notice msg={msg} />
    </div>
  );
}
