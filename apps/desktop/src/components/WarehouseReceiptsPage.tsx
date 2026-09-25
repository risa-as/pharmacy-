import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Copy,
  FileText,
  Gift,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  SplitSquareHorizontal,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { showConfirm } from "../lib/dialog";

// Receiving warehouse (مذخر) purchases: same server contract as before
// (operations:access / operations:request, /purchases, /purchases/:id/receive)
// and the same validation rules; this page only reorganises the workflow.

type Line = {
  key: string;
  itemId: string;
  drugName: string;
  scientificName?: string;
  orderedQuantity: number;
  lastCost: number | null;
  approvedFree: boolean;
  quantity: string;
  cost: string;
  batchNumber: string;
  expiryDate: string;
  suggestions: { batchNumber: string; expiryDate: string; quantity: number }[];
};

const num = (v: number) => Number(v || 0).toLocaleString("en-US");
const money = (v: number) => `${num(Math.round(Number(v || 0)))} د.ع`;
const day = (v: string) => new Date(v).toLocaleDateString("ar-IQ-u-nu-latn", { year: "numeric", month: "short", day: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);

const STATUS: Record<string, { label: string; tone: string; icon: typeof Clock3 }> = {
  PENDING: { label: "بانتظار الاستلام", tone: "bg-warning/10 text-warning border-warning/30", icon: Clock3 },
  COMPLETED: { label: "مستلم", tone: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  CANCELLED: { label: "ملغى", tone: "bg-muted text-muted-foreground border-border", icon: XCircle },
};
/**
 * Where a purchase stands, from its own status and its warehouse order's:
 * approved but not shipped yet, shipped/delivered (ready to receive), received,
 * or cancelled. PENDING_UNKNOWN is a server that does not report the order
 * status yet (older API): the old single "awaiting receipt" state.
 */
type Stage = "AWAITING_SHIPMENT" | "SHIPPED" | "DELIVERED" | "PENDING_UNKNOWN" | "COMPLETED" | "CANCELLED";
const stageOf = (r: any): Stage => {
  if (r.status === "COMPLETED" || r.status === "CANCELLED") return r.status;
  if (!("warehouseOrderStatus" in r)) return "PENDING_UNKNOWN";
  if (r.warehouseOrderStatus === "SHIPPED" || r.warehouseOrderStatus === "DELIVERED") return r.warehouseOrderStatus;
  return "AWAITING_SHIPMENT";
};
const STAGE: Record<Stage, { label: string; tone: string; icon: typeof Clock3 }> = {
  AWAITING_SHIPMENT: { label: "بانتظار الشحن من المذخر", tone: "bg-muted text-muted-foreground border-border", icon: Clock3 },
  SHIPPED: { label: "تم الشحن — جاهز للاستلام", tone: "bg-primary/10 text-primary border-primary/30", icon: Truck },
  DELIVERED: { label: "وصل — جاهز للاستلام", tone: "bg-primary/10 text-primary border-primary/30", icon: Truck },
  PENDING_UNKNOWN: { label: "بانتظار الاستلام", tone: "bg-warning/10 text-warning border-warning/30", icon: Clock3 },
  COMPLETED: { label: "مستلم", tone: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  CANCELLED: { label: "ملغى", tone: "bg-muted text-muted-foreground border-border", icon: XCircle },
};
const READY: Stage[] = ["SHIPPED", "DELIVERED"];
type Filter = "ACTIVE" | "READY" | "AWAITING_SHIPMENT" | "COMPLETED" | "CANCELLED" | "";
const matches = (stage: Stage, filter: Filter) =>
  !filter ||
  (filter === "ACTIVE" ? !["COMPLETED", "CANCELLED"].includes(stage)
    : filter === "READY" ? READY.includes(stage)
    : stage === filter);

function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGE[stage];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${s.tone}`}>
      <Icon size={13} />
      {s.label}
    </span>
  );
}

const SHIPPING: Record<string, { label: string; ready: boolean }> = {
  SHIPPED: { label: "مشحون — جاهز للاستلام", ready: true },
  DELIVERED: { label: "تم التسليم — جاهز للاستلام", ready: true },
};

const inputBase =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60";
const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none";

/** Field problems of one receiving line, in the order the user fills them. */
function lineIssues(l: Line): Partial<Record<"quantity" | "cost" | "batchNumber" | "expiryDate", string>> {
  const issues: Partial<Record<"quantity" | "cost" | "batchNumber" | "expiryDate", string>> = {};
  const q = Number(l.quantity);
  if (!l.quantity.trim() || !Number.isSafeInteger(q) || q <= 0) issues.quantity = "كمية صحيحة أكبر من صفر";
  const c = Number(l.cost);
  if (!l.cost.trim() || !Number.isFinite(c) || c < 0) issues.cost = "تكلفة صالحة";
  else if (c === 0 && !l.approvedFree) issues.cost = "الصفر للبونص المعتمد فقط";
  if (!l.batchNumber.trim()) issues.batchNumber = "رقم الدفعة مطلوب";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.expiryDate)) issues.expiryDate = "تاريخ الصلاحية مطلوب";
  return issues;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "bg-muted text-muted-foreground border-border", icon: Clock3 };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${s.tone}`}>
      <Icon size={13} />
      {s.label}
    </span>
  );
}

function Stat({ label, value, hint, tone = "", loading = false }: { label: string; value: string; hint?: string; tone?: string; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {loading
        ? <div className="mt-2.5 h-6 w-16 rounded-md bg-muted motion-safe:animate-pulse" />
        : <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Last list shown, per signed-in user. Coming back to the page shows it at once
 * while a fresh copy loads in the background (each request is a round trip to
 * the cloud, plus a permission check).
 */
let lastList: { user: string; access: any; rows: any[] } | null = null;

export default function WarehouseReceiptsPage({ userId = "" }: { userId?: string }) {
  const cached = lastList && lastList.user === userId ? lastList : null;
  const [access, setAccess] = useState<any>(cached?.access ?? null);
  const [rows, setRows] = useState<any[]>(cached?.rows ?? []);
  // True once a list (fresh or cached) is on screen; placeholders show until then.
  const [loaded, setLoaded] = useState(!!cached);
  const [detail, setDetail] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);

  const api = async (path: string, method = "GET", body?: any) => {
    const res = await window.ipcRenderer.invoke("operations:request", { path, method, body });
    if (!res?.success) throw Error(res?.error || "تعذر الاتصال بالخادم");
    if (res.warning && live.current) setNotice(res.warning);
    return res.data;
  };
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  };
  const load = async () => {
    const result = (await api("/purchases")).filter((r: any) => r.warehouseOrderId);
    if (!live.current) return;
    setRows(result);
    setLoaded(true);
    if (access) lastList = { user: userId, access, rows: result };
  };
  const open = async (id: string) => {
    const doc = await api(`/purchases/${id}`);
    if (!live.current) return;
    setDetail(doc);
    setTouched(false);
    setLines(
      doc.items.map((i: any): Line => ({
        key: crypto.randomUUID(),
        itemId: i.id,
        drugName: i.drugName,
        scientificName: i.scientificName,
        orderedQuantity: i.quantity,
        lastCost: i.lastCost ?? null,
        approvedFree: i.cost === 0 && !!doc.warehouseOrderId,
        quantity: String(i.quantity),
        cost: String(i.cost),
        batchNumber: i.shippedPrefill?.kind === "SINGLE" ? i.shippedPrefill.batchNumber : i.batchNumber || "",
        expiryDate: String(i.shippedPrefill?.kind === "SINGLE" ? i.shippedPrefill.expiryDate : i.expiryDate || "").slice(0, 10),
        suggestions: i.shippedPrefill?.batches || [],
      })),
    );
  };

  useEffect(() => {
    live.current = true;
    void run(async () => {
      // Both requests start together: the list request checks permissions on
      // the server too, so it need not wait for the access check to return.
      const listing = api("/purchases").then(
        (result) => ({ ok: true as const, rows: result.filter((r: any) => r.warehouseOrderId) }),
        (error) => ({ ok: false as const, error }),
      );
      const result = await window.ipcRenderer.invoke("operations:access");
      if (!result?.success) throw Error(result?.error || "يلزم الاتصال بالخادم");
      if (!live.current) return;
      setAccess(result);
      if (!result.permissions.canViewSuppliers || !result.features.warehouseManagement)
        throw Error("هذه الوظيفة غير متاحة ضمن صلاحيات الحساب أو الاشتراك");
      const list = await listing;
      if (!list.ok) throw list.error;
      if (!live.current) return;
      setRows(list.rows);
      setLoaded(true);
      lastList = { user: userId, access: result, rows: list.rows };
    });
    return () => {
      live.current = false;
    };
  }, []);

  const receive = async () => {
    setTouched(true);
    if (lines.some((l) => Object.keys(lineIssues(l)).length))
      throw Error("راجع الحقول المعلَّمة: الكمية والتكلفة ورقم الدفعة والصلاحية لكل بند. الصفر مسموح فقط للبونص المعتمد.");
    if (
      !(await showConfirm({
        title: "تأكيد الاستلام",
        message:
          "تحقق من الدفعات الموجودة فعلياً وتواريخها. سيُضاف المخزون ويُحدّث حساب المورد؛ لن يُسجّل دفع نقدي من هذه الشاشة.",
        actionLabel: "استلام المواد",
      }))
    )
      return;
    await api(`/purchases/${detail.id}/receive`, "POST", {
      isPaid: false,
      items: lines.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        cost: Number(l.cost),
        batchNumber: l.batchNumber.trim(),
        expiryDate: l.expiryDate,
      })),
    });
    await open(detail.id);
    await load();
  };

  const editable =
    detail?.status === "PENDING" &&
    access?.permissions.canReceivePurchase &&
    ["SHIPPED", "DELIVERED"].includes(detail.warehouseOrderStatus);
  const change = (key: string, patch: Partial<Line>) =>
    setLines((previous) => previous.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  // ── List view data ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { ready: 0, awaiting: 0, active: 0, COMPLETED: 0, CANCELLED: 0, pendingValue: 0 };
    for (const r of rows) {
      const stage = stageOf(r);
      if (READY.includes(stage)) c.ready++;
      if (stage === "AWAITING_SHIPMENT") c.awaiting++;
      if (stage === "COMPLETED" || stage === "CANCELLED") c[stage]++;
      else {
        c.active++;
        c.pendingValue += Number(r.total || 0);
      }
    }
    return c;
  }, [rows]);
  // Shipping stages exist only when the server reports the order status.
  const shippingKnown = rows.some((r) => "warehouseOrderStatus" in r);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matches(stageOf(r), filter) &&
        (!q ||
          [r.documentNumber, r.invoiceNumber, r.supplier?.name].some((v) => String(v || "").toLowerCase().includes(q))),
    );
  }, [rows, filter, query]);

  // ── Detail view data ───────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const byItem = new Map<string, Line[]>();
    for (const l of lines) byItem.set(l.itemId, [...(byItem.get(l.itemId) || []), l]);
    return Array.from(byItem.values());
  }, [lines]);
  const summary = useMemo(() => {
    const invalid = lines.filter((l) => Object.keys(lineIssues(l)).length).length;
    const units = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const ordered = groups.reduce((s, g) => s + g[0].orderedQuantity, 0);
    const cost = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost) || 0), 0);
    const itemsComplete = groups.filter(
      (g) => g.reduce((s, l) => s + (Number(l.quantity) || 0), 0) === g[0].orderedQuantity && g.every((l) => !Object.keys(lineIssues(l)).length),
    ).length;
    return { invalid, units, ordered, cost, itemsComplete };
  }, [lines, groups]);

  const leave = async () => {
    if (
      editable &&
      !(await showConfirm({
        title: "العودة للقائمة",
        message: "قد توجد تغييرات لم تُحفظ. هل تريد مغادرة التفاصيل؟",
        actionLabel: "عودة",
      }))
    )
      return;
    setDetail(null);
  };

  return (
    <div dir="rtl" className="h-full overflow-y-auto bg-background text-foreground">
      <div className="space-y-5 p-6 pb-28">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PackageCheck size={22} />
            </span>
            <div>
              <h1 className="text-2xl font-bold">استلام مشتريات المذاخر</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {access?.branchName || "فرع الجهاز"} · مطابقة الشحنة وإدخال الدفعات الحقيقية إلى المخزون
              </p>
            </div>
          </div>
          <button className={btn} disabled={busy} onClick={() => void run(async () => { await load(); if (detail) await open(detail.id); })}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            تحديث
          </button>
        </header>

        {error && (
          <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={18} />
            <div>
              <p className="font-semibold text-destructive">{error}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                عند انقطاع الاتصال بعد التأكيد، حدّث السجل للتأكد من حالة العملية قبل إعادة الإرسال.
              </p>
            </div>
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            {notice}
          </div>
        )}

        {!detail && (
          <>
            {/* ── Summary ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {shippingKnown ? (
                <>
                  <Stat label="تم شحنها — جاهزة للاستلام" value={num(counts.ready)} tone="text-primary" hint="خرجت من المذخر؛ طابقها وأدخلها المخزون" loading={!loaded} />
                  <Stat label="بانتظار الشحن من المذخر" value={num(counts.awaiting)} tone="text-muted-foreground" hint="معتمدة ولم تُشحن بعد" loading={!loaded} />
                </>
              ) : (
                <>
                  <Stat label="بانتظار الاستلام" value={num(counts.active)} tone="text-warning" hint="طلبات معتمدة لم تدخل المخزون" loading={!loaded} />
                  <Stat label="ملغاة" value={num(counts.CANCELLED)} tone="text-muted-foreground" loading={!loaded} />
                </>
              )}
              <Stat label="قيمة المعلّق" value={money(counts.pendingValue)} loading={!loaded} />
              <Stat label="مستلمة" value={num(counts.COMPLETED)} tone="text-success" loading={!loaded} />
            </div>

            {/* ── Toolbar ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-border bg-card p-1">
                {(shippingKnown
                  ? ([["ACTIVE", "قيد المتابعة"], ["READY", `جاهزة للاستلام (${num(counts.ready)})`], ["AWAITING_SHIPMENT", `بانتظار الشحن (${num(counts.awaiting)})`], ["COMPLETED", "مستلمة"], ["CANCELLED", "ملغاة"], ["", "الكل"]] as [Filter, string][])
                  : ([["ACTIVE", "بانتظار الاستلام"], ["COMPLETED", "مستلمة"], ["CANCELLED", "ملغاة"], ["", "الكل"]] as [Filter, string][])
                ).map(([value, label]) => (
                  <button
                    key={value || "all"}
                    onClick={() => setFilter(value)}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${filter === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="relative min-w-60 flex-1">
                <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={`${inputBase} border-border pr-9`}
                  placeholder="بحث برقم المستند أو الفاتورة أو اسم المذخر"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>

            {/* ── List ────────────────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="grid grid-cols-[1.2fr_1.4fr_1fr_0.7fr_1fr_1fr_auto] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-bold text-muted-foreground">
                <span>المستند</span>
                <span>المذخر</span>
                <span>التاريخ</span>
                <span>الأصناف</span>
                <span>الإجمالي</span>
                <span>الحالة</span>
                <span className="w-4" />
              </div>
              {visible.map((r) => (
                <button
                  key={r.id}
                  disabled={busy}
                  onClick={() => void run(() => open(r.id))}
                  className="grid w-full grid-cols-[1.2fr_1.4fr_1fr_0.7fr_1fr_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-right text-sm transition-colors last:border-b-0 hover:bg-primary/5"
                >
                  <span>
                    <b className="font-mono" dir="ltr">{r.documentNumber || "—"}</b>
                    {r.invoiceNumber && <span className="block text-xs text-muted-foreground">فاتورة {r.invoiceNumber}</span>}
                  </span>
                  <span className="truncate font-medium">{r.supplier?.name || "—"}</span>
                  <span className="text-muted-foreground">{day(r.createdAt)}</span>
                  <span className="tabular-nums">{num(r._count?.items ?? 0)}</span>
                  <span className="font-bold tabular-nums">{money(r.total)}</span>
                  <span><StageBadge stage={stageOf(r)} /></span>
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
              ))}
              {!loaded && busy && [0, 1, 2, 3].map((n) => (
                <div key={n} className="grid grid-cols-[1.2fr_1.4fr_1fr_0.7fr_1fr_1fr_auto] items-center gap-3 border-b border-border px-4 py-4 last:border-b-0">
                  {[24, 32, 20, 8, 20, 28].map((w, i) => <span key={i} className="h-3.5 rounded-md bg-muted motion-safe:animate-pulse" style={{ width: `${w * 4}px`, maxWidth: "100%" }} />)}
                  <span className="w-4" />
                </div>
              ))}
              {loaded && !busy && !visible.length && (
                <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                  <Boxes size={36} className="opacity-40" />
                  <p className="font-semibold">{rows.length ? "لا توجد نتائج مطابقة" : "لا توجد مشتريات مذاخر بعد"}</p>
                  <p className="text-sm">تظهر هنا الطلبات التي اعتمدها المذخر عند وصولها.</p>
                </div>
              )}
            </div>
          </>
        )}

        {access && detail && (
          <>
            <button className={btn} disabled={busy} onClick={() => void leave()}>
              <ArrowRight size={16} />
              كل المشتريات
            </button>

            {/* ── Document card ───────────────────────────────────────────── */}
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-bold"><span className="font-mono" dir="ltr">{detail.documentNumber}</span></h2>
                    <StatusBadge status={detail.status} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 size={14} /> {detail.supplier?.name || "—"}
                  </p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">إجمالي المستند</p>
                  <p className="text-2xl font-bold tabular-nums">{money(detail.total)}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm md:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">طلب المذخر</dt><dd className="mt-0.5 font-semibold"><span className="font-mono" dir="ltr">{detail.warehouseOrderNumber || "—"}</span></dd></div>
                <div><dt className="text-xs text-muted-foreground">فاتورة المورد</dt><dd className="mt-0.5 font-semibold"><span dir="ltr">{detail.invoiceNumber || "—"}</span></dd></div>
                <div><dt className="text-xs text-muted-foreground">تاريخ الإنشاء</dt><dd className="mt-0.5 flex items-center gap-1.5 font-semibold"><CalendarDays size={14} />{day(detail.createdAt)}</dd></div>
                <div>
                  <dt className="text-xs text-muted-foreground">حالة الشحن</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-semibold">
                    <Truck size={14} className={detail.status === "COMPLETED" || SHIPPING[detail.warehouseOrderStatus]?.ready ? "text-success" : "text-muted-foreground"} />
                    {detail.status === "COMPLETED" ? "مستلم ومُدخل للمخزون"
                      : detail.status === "CANCELLED" ? "ملغى"
                      : SHIPPING[detail.warehouseOrderStatus]?.label || "لم يُشحن بعد"}
                  </dd>
                </div>
              </dl>
            </section>

            {detail.status === "PENDING" && !["SHIPPED", "DELIVERED"].includes(detail.warehouseOrderStatus) && (
              <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
                <Truck className="shrink-0 text-warning" size={18} />
                <p>
                  الطلب {detail.warehouseOrderNumber || ""} لم يخرج للتسليم بعد، أو تعذّر تأكيد حالته. يصبح الاستلام متاحًا بعد
                  الشحن.
                </p>
              </div>
            )}
            {detail.status === "PENDING" && ["SHIPPED", "DELIVERED"].includes(detail.warehouseOrderStatus) && !access.permissions.canReceivePurchase && (
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                عرض فقط: استلام المشتريات غير متاح ضمن صلاحيات حسابك.
              </div>
            )}

            {/* ── Received batches (completed) ────────────────────────────── */}
            {detail.status === "COMPLETED" && (
              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <h3 className="flex items-center gap-2 border-b border-border px-5 py-3 font-bold">
                  <CheckCircle2 size={18} className="text-success" /> الدفعات التي دخلت المخزون
                </h3>
                {detail.receivedBatches?.length ? (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2 text-right font-bold">الصنف</th>
                        <th className="px-3 py-2 text-right font-bold">الدفعة</th>
                        <th className="px-3 py-2 text-right font-bold">الصلاحية</th>
                        <th className="px-3 py-2 text-right font-bold">تكلفة الوحدة</th>
                        <th className="px-5 py-2 text-right font-bold">الرصيد الحالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.receivedBatches.map((b: any) => (
                        <tr key={b.id} className="border-t border-border">
                          <td className="px-5 py-2.5 font-semibold">{detail.items.find((item: any) => item.id === b.purchaseItemId)?.drugName}</td>
                          <td className="px-3 py-2.5"><span className="font-mono" dir="ltr">{b.batchNumber}</span></td>
                          <td className="px-3 py-2.5">{String(b.expiryDate).slice(0, 10)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{money(b.costPrice)}</td>
                          <td className="px-5 py-2.5 font-bold tabular-nums">{num(b.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">لا توجد دفعات مرتبطة بهذا المستند القديم؛ راجع سجل الاستلام.</p>
                )}
              </section>
            )}

            {/* ── Items to receive ────────────────────────────────────────── */}
            {detail.status !== "COMPLETED" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-bold">
                    <FileText size={18} /> الأصناف ({groups.length})
                  </h3>
                  {editable && (
                    <p className="text-xs text-muted-foreground">
                      الاستلام يتطلب كامل الكمية المعتمدة؛ يمكن توزيعها على أكثر من دفعة.
                    </p>
                  )}
                </div>
                {groups.map((group) => {
                  const head = group[0];
                  const allocated = group.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
                  const diff = allocated - head.orderedQuantity;
                  const complete = diff === 0 && group.every((l) => !Object.keys(lineIssues(l)).length);
                  return (
                    <section
                      key={head.itemId}
                      className={`overflow-hidden rounded-xl border bg-card shadow-sm ${editable && touched && !complete ? "border-destructive/40" : complete && editable ? "border-success/40" : "border-border"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3">
                        <div className="flex items-center gap-3">
                          {editable && (
                            complete
                              ? <CheckCircle2 size={20} className="text-success" />
                              : <span className="h-5 w-5 rounded-full border-2 border-muted-foreground/40" />
                          )}
                          <div>
                            <h4 className="font-bold">{head.drugName}</h4>
                            {head.scientificName && <p className="text-xs text-muted-foreground">{head.scientificName}</p>}
                          </div>
                          {head.approvedFree && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                              <Gift size={12} /> بونص معتمد
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">المعتمد <b className="text-foreground tabular-nums">{num(head.orderedQuantity)}</b></span>
                          <span className={`rounded-md px-2 py-0.5 font-bold tabular-nums ${diff === 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                            موزّع {num(allocated)}
                            {diff !== 0 && ` (${diff > 0 ? "+" : ""}${num(diff)})`}
                          </span>
                          {head.lastCost != null && (
                            <span className="text-xs text-muted-foreground">آخر تكلفة {money(head.lastCost)}</span>
                          )}
                        </div>
                      </div>

                      <div className="divide-y divide-border">
                        {group.map((l, splitIndex) => {
                          const issues = touched ? lineIssues(l) : {};
                          const field = (key: "quantity" | "cost" | "batchNumber" | "expiryDate", label: string, type: string, extra: object = {}) => (
                            <label className="text-xs font-semibold text-muted-foreground">
                              {label}
                              <input
                                className={`${inputBase} mt-1 ${issues[key] ? "border-destructive" : "border-border"} ${key === "batchNumber" ? "font-mono" : ""}`}
                                type={type}
                                value={l[key]}
                                disabled={!editable || busy}
                                aria-invalid={!!issues[key]}
                                onChange={(e) => change(l.key, { [key]: e.target.value } as Partial<Line>)}
                                {...extra}
                              />
                              {issues[key] && <span className="mt-1 block text-destructive">{issues[key]}</span>}
                            </label>
                          );
                          return (
                            <div key={l.key} className="px-5 py-4">
                              {group.length > 1 && (
                                <p className="mb-2 text-xs font-bold text-muted-foreground">الدفعة {splitIndex + 1} من {group.length}</p>
                              )}
                              <div className="grid gap-3 md:grid-cols-[0.8fr_1fr_1.3fr_1fr_auto] md:items-start">
                                {field("quantity", "الكمية المستلمة", "number", { min: 1, step: 1, inputMode: "numeric" })}
                                {field("cost", "تكلفة الوحدة (د.ع)", "number", { min: 0, step: "any" })}
                                {field("batchNumber", "رقم الدفعة الحقيقي", "text", { dir: "ltr" })}
                                {field("expiryDate", "تاريخ الصلاحية", "date", { min: today() })}
                                {editable && group.length > 1 && (
                                  <button
                                    className={`${btn} mt-5 text-destructive`}
                                    disabled={busy}
                                    aria-label="حذف هذه الدفعة"
                                    onClick={() => setLines((old) => old.filter((row) => row.key !== l.key))}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                              {editable && l.suggestions.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-muted-foreground">دفعات الشحنة:</span>
                                  {l.suggestions.map((s, i) => {
                                    const active = s.batchNumber === l.batchNumber && String(s.expiryDate).slice(0, 10) === l.expiryDate;
                                    return (
                                      <button
                                        key={i}
                                        disabled={busy}
                                        onClick={() => change(l.key, { batchNumber: s.batchNumber, expiryDate: String(s.expiryDate).slice(0, 10) })}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary"}`}
                                      >
                                        <Copy size={11} />
                                        <span className="font-mono" dir="ltr">{s.batchNumber}</span> · {String(s.expiryDate).slice(0, 10)} · {num(s.quantity)} وحدة
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {editable && (
                        <div className="border-t border-border bg-muted/20 px-5 py-2.5">
                          <button
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-40"
                            disabled={busy}
                            onClick={() =>
                              setLines((old) => {
                                const at = old.map((row) => row.itemId).lastIndexOf(head.itemId);
                                const copy: Line = { ...head, key: crypto.randomUUID(), quantity: "", batchNumber: "", expiryDate: "" };
                                return [...old.slice(0, at + 1), copy, ...old.slice(at + 1)];
                              })
                            }
                          >
                            <SplitSquareHorizontal size={15} />
                            تقسيم على دفعة أخرى
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Sticky confirm bar ─────────────────────────────────────────────── */}
      {access && detail && editable && (
        <div className="sticky bottom-0 border-t border-border bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
            <div className="flex flex-wrap items-center gap-5 text-sm">
              <span>
                الأصناف الجاهزة{" "}
                <b className={summary.itemsComplete === groups.length ? "text-success" : "text-warning"}>
                  {num(summary.itemsComplete)}/{num(groups.length)}
                </b>
              </span>
              <span>الكمية <b className="tabular-nums">{num(summary.units)}</b> من {num(summary.ordered)}</span>
              <span>تكلفة الاستلام <b className="tabular-nums">{money(summary.cost)}</b></span>
              {touched && summary.invalid > 0 && (
                <span className="font-semibold text-destructive">{num(summary.invalid)} دفعة تحتاج تصحيحاً</span>
              )}
            </div>
            <button className={primaryBtn} disabled={busy} onClick={() => void run(receive)}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
              مراجعة وتأكيد استلام المواد
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
