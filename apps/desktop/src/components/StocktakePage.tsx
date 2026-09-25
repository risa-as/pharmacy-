import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { showConfirm } from "../lib/dialog";

// Stocktake on the desktop, laid out like the web page
// (dashboard/inventory/stocktakes): a list of counts, then a counting table of
// every batch in the branch with system vs actual quantity, the difference and
// its value at cost. Same server contract as before (operations:* IPC,
// /inventory/stocktake, /inventory/operation-batches).

type Row = {
  batchId: string;
  drugName: string;
  barcode: string;
  expiryDate: string;
  costPrice: number;
  systemQuantity: number;
  actual: string;
  reasonCode: "DAMAGE" | "UNKNOWN";
  reason: string;
};

const num = (v: number) => Number(v || 0).toLocaleString("en-US");
const money = (v: number) => `${num(Math.round(Number(v || 0)))} د.ع`;
const REASON_PREFIX = /^تصنيف الجرد: [^\n]*\n/;
const parseReason = (reason = "") => ({
  reasonCode: (reason.startsWith("تصنيف الجرد: تلف مؤكد\n") ? "DAMAGE" : "UNKNOWN") as Row["reasonCode"],
  reason: reason.replace(REASON_PREFIX, ""),
});
const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "قيد الإجراء", tone: "bg-warning/10 text-warning ring-warning/20" },
  REVIEW: { label: "بانتظار اعتماد المدير", tone: "bg-warning/10 text-warning ring-warning/20" },
  COMPLETED: { label: "مكتمل", tone: "bg-success/10 text-success ring-success/20" },
  CANCELLED: { label: "ملغي", tone: "bg-destructive/10 text-destructive ring-destructive/20" },
};
const DETAIL_STATUS: Record<string, string> = {
  PENDING: "مسودة",
  REVIEW: "بانتظار اعتماد المدير",
  CANCELLED: "ملغى",
  COMPLETED: "مكتمل ومُرحّل",
};
/** Server limit per stocktake (PUT accepts at most 3000 items). */
const MAX_ITEMS = 3000;

const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-md shadow-primary/30 transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none";

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "bg-muted text-muted-foreground ring-border" };
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${s.tone}`}>{s.label}</span>;
}

/**
 * Last stocktake list shown, per signed-in user. Coming back to the page shows
 * it at once while a fresh copy loads in the background (each request is a
 * round trip to the cloud, plus a permission check).
 */
let lastList: { user: string; access: any; list: any[] } | null = null;

export default function StocktakePage({ userId = "" }: { userId?: string }) {
  const cached = lastList && lastList.user === userId ? lastList : null;
  const [access, setAccess] = useState<any>(cached?.access ?? null);
  const [list, setList] = useState<any[]>(cached?.list ?? []);
  // True once a list (fresh or cached) is on screen; placeholders show until then.
  const [loaded, setLoaded] = useState(!!cached);
  const [detail, setDetail] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
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
      if (live.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };
  const load = async () => {
    const result = await api("/inventory/stocktake");
    if (!live.current) return;
    setList(result.stocktakes);
    setLoaded(true);
    if (access) lastList = { user: userId, access, list: result.stocktakes };
  };

  const toRow = (b: any): Row => ({
    batchId: b.id,
    drugName: b.inventory.drug.tradeName,
    barcode: b.inventory.drug.barcode || "",
    expiryDate: b.expiryDate,
    costPrice: b.costPrice ?? 0,
    systemQuantity: b.quantity,
    actual: String(b.quantity),
    reasonCode: "UNKNOWN",
    reason: "",
  });

  /**
   * Fallback for servers without the one-request sheet: every batch of the
   * branch that still holds stock, 40 per request (slow on large branches).
   */
  const branchBatches = async (): Promise<Row[]> => {
    const out: Row[] = [];
    for (let page = 1; ; page++) {
      if (live.current) setProgress(`جارٍ تحميل دفعات الفرع… ${num(out.length)}`);
      const data = await api(`/inventory/operation-batches?page=${page}`);
      for (const b of data.items) if (b.quantity > 0) out.push(toRow(b));
      if (!data.hasMore) return out;
    }
  };

  const open = async (id: string, status?: string) => {
    // A draft needs the whole count sheet; the server returns it in one
    // response (type=sheet). Finished counts only need what was counted.
    const draft = status === undefined || status === "PENDING";
    if (draft) setProgress("جارٍ تحميل ورقة الجرد…");
    const { stocktake, sheet } = await api(`/inventory/stocktake/${id}${draft ? "?type=sheet" : ""}`);
    const saved: Row[] = stocktake.items.map((i: any) => ({
      batchId: i.batchId,
      drugName: i.batch?.inventory?.drug?.tradeName ?? "—",
      barcode: i.batch?.inventory?.drug?.barcode ?? "",
      expiryDate: i.batch?.expiryDate,
      costPrice: i.costPrice,
      systemQuantity: i.systemQuantity,
      actual: String(i.actualQuantity),
      ...parseReason(i.reason || ""),
    }));
    let next = saved;
    // A draft counts the whole branch: every batch in stock, the saved counts
    // kept on top (as the web count sheet does). Finished counts show what was counted.
    if (stocktake.status === "PENDING") {
      const counted = new Map(saved.map((r) => [r.batchId, r]));
      const all: Row[] = Array.isArray(sheet) ? sheet.map(toRow) : await branchBatches();
      next = [...all.map((r) => counted.get(r.batchId) ?? r), ...saved.filter((r) => !all.some((a) => a.batchId === r.batchId))];
    }
    if (!live.current) return;
    setDetail(stocktake);
    setRows(next);
    setSearch("");
  };

  useEffect(() => {
    live.current = true;
    void run(async () => {
      // Both requests start together: the list request checks permissions on
      // the server too, so it need not wait for the access check to return.
      const listing = api("/inventory/stocktake").then(
        (result) => ({ ok: true as const, list: result.stocktakes as any[] }),
        (error) => ({ ok: false as const, error }),
      );
      const result = await window.ipcRenderer.invoke("operations:access");
      if (!result?.success) throw Error(result?.error || "يلزم الاتصال بالخادم");
      if (!live.current) return;
      setAccess(result);
      if (!result.permissions.canDoStocktake) throw Error("هذه الوظيفة غير متاحة ضمن صلاحيات الحساب");
      const fetched = await listing;
      if (!fetched.ok) throw fetched.error;
      if (!live.current) return;
      setList(fetched.list);
      setLoaded(true);
      lastList = { user: userId, access: result, list: fetched.list };
    });
    return () => {
      live.current = false;
    };
  }, []);

  const editable = detail?.status === "PENDING";

  // "Delete" a draft: the server cancels it (only while PENDING, stock never
  // changed), keeping its trace as a cancelled record, as the web does.
  const removeDraft = async (id: string, documentNumber: string) => {
    if (
      !(await showConfirm({
        title: "حذف مسودة الجرد",
        message: `ستُحذف المسودة ${documentNumber} ولن يتغير المخزون. يبقى أثرها في السجل كجرد ملغي.`,
        actionLabel: "حذف المسودة",
      }))
    )
      return;
    await api(`/inventory/stocktake/${id}`, "DELETE");
    if (detail?.id === id) setDetail(null);
    setNotice(`حُذفت مسودة الجرد ${documentNumber}.`);
    await load();
  };
  const change = (batchId: string, patch: Partial<Row>) =>
    setRows((previous) => previous.map((r) => (r.batchId === batchId ? { ...r, ...patch } : r)));

  const save = async (complete: boolean) => {
    if (rows.some((r) => !r.actual.trim() || !Number.isSafeInteger(Number(r.actual)) || Number(r.actual) < 0))
      throw Error("أدخل العدد الفعلي الصحيح لكل دفعة");
    if (rows.length > MAX_ITEMS) throw Error(`الجرد يتسع لـ ${num(MAX_ITEMS)} دفعة كحد أقصى؛ قسّم الجرد من لوحة الويب.`);
    if (complete && !rows.length) throw Error("لا توجد دفعات للجرد");
    if (
      complete &&
      !(await showConfirm({
        title: "إنهاء العد",
        message: "إذا وُجد عجز يُرسل الجرد إلى المدير قبل تعديل المخزون وتسجيل المصروف. دون عجز تُعتمد الكميات مباشرة. هل تريد المتابعة؟",
        actionLabel: "إنهاء العد وإرسال النتيجة",
      }))
    )
      return;
    const result = await api(`/inventory/stocktake/${detail.id}`, "PUT", {
      status: complete ? "COMPLETED" : "PENDING",
      items: rows.map((r) => ({
        batchId: r.batchId,
        systemQuantity: r.systemQuantity,
        actualQuantity: Number(r.actual),
        reasonCode: Number(r.actual) < r.systemQuantity ? r.reasonCode : "UNKNOWN",
        reason: r.reason,
      })),
    });
    if (complete) {
      setNotice(result.stocktake?.status === "REVIEW" ? "أُرسل العجز إلى المدير؛ المخزون لم يتغير بعد." : "تم اعتماد الجرد.");
      setDetail(null);
      await load();
    } else {
      setNotice("تم الحفظ كمسودة.");
      await load();
    }
  };

  // ── Figures, as on the web count sheet ────────────────────────────────────
  const totals = useMemo(() => {
    let loss = 0, gain = 0;
    for (const r of rows) {
      const diff = (Number(r.actual) || 0) - r.systemQuantity;
      if (diff < 0) loss += Math.abs(diff * r.costPrice);
      if (diff > 0) gain += diff * r.costPrice;
    }
    return { loss, gain };
  }, [rows]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.drugName.toLowerCase().includes(q) || r.barcode.includes(q)) : rows;
  }, [rows, search]);
  const inReview = list.filter((s) => s.status === "REVIEW");
  const cancelledCount = list.filter((s) => s.status === "CANCELLED").length;
  const shown = showCancelled ? list : list.filter((s) => s.status !== "CANCELLED");

  return (
    <div dir="rtl" className="h-full overflow-y-auto text-foreground">
      <div className="space-y-6 p-6">
        {error && (
          <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={18} />
            <div>
              <p className="font-semibold text-destructive">{error}</p>
              <p className="mt-1 text-sm text-muted-foreground">عند انقطاع الاتصال بعد التأكيد، حدّث السجل للتأكد من حالة العملية قبل إعادة الإرسال.</p>
            </div>
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 size={16} /> {notice}
          </div>
        )}

        {!detail && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex w-full items-center justify-between gap-4">
              <h1 className="text-2xl font-bold">جرد وتسوية المخزون</h1>
              <div className="flex gap-2">
                <button className={btn} disabled={busy} onClick={() => void run(load)}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  تحديث
                </button>
                {(!access || access.permissions.canDoStocktake) && (
                  <button
                    className={primaryBtn}
                    disabled={busy || !access}
                    onClick={() =>
                      void run(async () => {
                        const d = await api("/inventory/stocktake", "POST", {});
                        await load();
                        await open(d.stocktake.id, "PENDING");
                      })
                    }
                  >
                    <Plus size={16} />
                    بدء جرد جديد
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{access?.branchName || "فرع الجهاز"} · يتطلب الاتصال ومزامنة المخزون</p>

            <div className="mt-6 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <h4 className="mb-1 flex items-center gap-2 font-bold">
                <AlertTriangle size={16} /> تنبيه هام
              </h4>
              <p className="opacity-90">
                أدخل العدد الفعلي وحدد التلف المؤكد إن وجد. الجرد الذي يحتوي عجزاً يُرسل إلى المدير لاعتماده أو طلب إعادة العد. لا تتغير كمياته ولا يُسجّل مصروفه قبل اعتماد المدير.
              </p>
            </div>

            {inReview.length > 0 && (
              <div className="mt-6 rounded-lg border border-warning/30 bg-warning/10 p-4">
                <p className="font-bold">{num(inReview.length)} عمليات جرد بانتظار اعتماد المدير</p>
                <p className="mt-1 text-sm text-muted-foreground">يعتمد المدير العجز أو يطلب إعادة العد من لوحة الويب.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {inReview.map((s) => (
                    <button key={s.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted" disabled={busy} onClick={() => void run(() => open(s.id, s.status))}>
                      مراجعة العجز · <bdi className="font-mono">{s.documentNumber}</bdi>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cancelledCount > 0 && (
              <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
                إظهار المسودات المحذوفة ({num(cancelledCount)})
              </label>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right text-foreground">
                <thead className="text-sm">
                  <tr className="border-b border-border">
                    <th className="px-4 py-4 font-medium">رقم الجرد</th>
                    <th className="px-3 py-4 font-medium">التاريخ</th>
                    <th className="px-3 py-4 font-medium">الموظف</th>
                    <th className="px-3 py-4 font-medium">الدفعات</th>
                    <th className="px-3 py-4 font-medium">الحالة</th>
                    <th className="px-3 py-4 font-medium">الفرق المالي (خسارة/زيادة)</th>
                    <th className="px-3 py-4"><span className="sr-only">إجراءات</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id} className="border-b border-border text-sm last:border-none hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3 font-medium"><bdi className="font-mono">{s.documentNumber}</bdi></td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {new Date(s.createdAt).toLocaleDateString("ar-IQ-u-nu-latn")} {new Date(s.createdAt).toLocaleTimeString("ar-IQ-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{s.user?.name || "غير معروف"}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{num(s._count?.items ?? 0)}</td>
                      <td className="whitespace-nowrap px-3 py-3"><Badge status={s.status} /></td>
                      <td className="whitespace-nowrap px-3 py-3 font-bold">
                        {s.status === "COMPLETED" ? (
                          <bdi className={s.totalDiscrepancyAmount < 0 ? "text-destructive" : s.totalDiscrepancyAmount > 0 ? "text-success" : "text-muted-foreground"}>
                            {num(s.totalDiscrepancyAmount)} د.ع
                          </bdi>
                        ) : (
                          <span className="font-normal text-muted-foreground">{s.status === "CANCELLED" ? "—" : "قيد الحساب..."}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {s.status !== "CANCELLED" && (
                          <div className="flex justify-end gap-2">
                            <button
                              className={`rounded-md border p-2 hover:bg-muted ${s.status === "PENDING" ? "border-primary/20 bg-primary/10 text-primary" : "border-border"}`}
                              title={s.status === "PENDING" ? "متابعة الجرد" : "عرض التفاصيل"}
                              aria-label={s.status === "PENDING" ? "متابعة الجرد" : "عرض التفاصيل"}
                              disabled={busy}
                              onClick={() => void run(() => open(s.id, s.status))}
                            >
                              <Eye size={18} />
                            </button>
                            {s.status === "PENDING" && (
                              <button
                                className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-destructive hover:bg-destructive/20"
                                title="حذف المسودة"
                                aria-label="حذف المسودة"
                                disabled={busy}
                                onClick={() => void run(() => removeDraft(s.id, s.documentNumber))}
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loaded && busy && [0, 1, 2, 3].map((n) => (
                    <tr key={n} className="border-b border-border last:border-none">
                      {[24, 32, 24, 8, 20, 24].map((w, i) => (
                        <td key={i} className="px-3 py-4"><div className="h-3.5 rounded-md bg-muted motion-safe:animate-pulse" style={{ width: `${w * 4}px`, maxWidth: "100%" }} /></td>
                      ))}
                      <td className="px-3 py-4"><div className="ms-auto h-9 w-9 rounded-md bg-muted motion-safe:animate-pulse" /></td>
                    </tr>
                  ))}
                  {loaded && !busy && !shown.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">لا يوجد سجلات جرد سابقة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detail && (
          <>
            <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-6 shadow-sm md:flex-row md:items-center">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-bold">
                  <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
                  تسوية الجرد
                </h1>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  الرقم المرجعي:{" "}
                  <bdi className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 font-mono font-semibold text-primary">{detail.documentNumber}</bdi>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${detail.status === "PENDING" || detail.status === "REVIEW" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                  {DETAIL_STATUS[detail.status] || detail.status}
                </span>
                {editable && (
                  <button
                    className={`${btn} border-destructive/30 text-destructive hover:bg-destructive/10`}
                    disabled={busy}
                    onClick={() => void run(() => removeDraft(detail.id, detail.documentNumber))}
                  >
                    <Trash2 size={16} /> حذف المسودة
                  </button>
                )}
                <button
                  className={btn}
                  disabled={busy}
                  onClick={async () => {
                    if (editable && !(await showConfirm({ title: "العودة للقائمة", message: "قد توجد تغييرات لم تُحفظ. هل تريد مغادرة الجرد؟", actionLabel: "عودة" }))) return;
                    setDetail(null);
                  }}
                >
                  <ArrowRight size={16} /> القائمة
                </button>
              </div>
            </div>

            {detail.status === "REVIEW" && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <p>بانتظار اعتماد المدير. الكميات لم تتغير بعد. يراجع المدير العدد والعجز من لوحة الويب، وإذا طلب إعادة العد تعود المسودة هنا.</p>
              </div>
            )}
            {detail.notes && <p className="rounded-lg border border-border bg-card p-4 text-sm">ملاحظات الجرد: {detail.notes}</p>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-4 shadow-sm">
                <span className="mb-1 text-sm text-muted-foreground">إجمالي المنتجات المجرودة</span>
                <span className="text-2xl font-black text-foreground tabular-nums">{num(rows.length)}</span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                <span className="mb-1 text-sm font-bold text-destructive">قيمة عجز الجرد بالتكلفة</span>
                <span className="text-2xl font-black text-destructive tabular-nums">{money(totals.loss)}</span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-success/20 bg-success/10 p-4">
                <span className="mb-1 text-sm font-bold text-success">قيمة فائض الجرد بالتكلفة</span>
                <span className="text-2xl font-black text-success tabular-nums">{money(totals.gain)}</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border shadow-sm">
              <div className="border-b border-border bg-card p-4">
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="ابحث عن دواء أو باركود للمطابقة..."
                    className="w-full rounded-lg border border-border bg-background p-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="max-h-[calc(100vh-24rem)] min-h-64 overflow-auto">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-card">
                    <tr>
                      <th className="p-3 font-medium text-muted-foreground">اسم المنتج</th>
                      <th className="w-28 px-2 py-3 font-medium text-muted-foreground">الباركود</th>
                      <th className="p-3 font-medium text-muted-foreground">تاريخ الصلاحية</th>
                      <th className="p-3 font-medium text-muted-foreground">سعر التكلفة</th>
                      <th className="bg-muted/30 p-3 font-bold text-foreground">النظام</th>
                      <th className="bg-primary/5 p-3 font-bold text-primary">الفعلي (الجرد)</th>
                      <th className="p-3 font-medium text-muted-foreground">الفرق</th>
                      <th className="p-3 font-medium text-muted-foreground">قيمة الفرق</th>
                      <th className="p-3 font-medium text-muted-foreground">التلف / ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const valid = r.actual.trim() !== "" && Number.isSafeInteger(Number(r.actual)) && Number(r.actual) >= 0;
                      const diff = (Number(r.actual) || 0) - r.systemQuantity;
                      const impact = diff * r.costPrice;
                      return (
                        <tr key={r.batchId} className="border-b border-border transition-colors hover:bg-muted/50">
                          <td className="p-3 font-medium text-foreground">{r.drugName}</td>
                          <td className="w-28 px-2 py-3 font-mono text-xs text-muted-foreground">
                            <span dir="ltr" title={r.barcode} className="block w-24 truncate text-left">{r.barcode}</span>
                          </td>
                          <td className="p-3 text-muted-foreground">{r.expiryDate ? new Date(r.expiryDate).toLocaleDateString("en-GB") : "—"}</td>
                          <td className="p-3 font-mono text-muted-foreground">{num(r.costPrice)}</td>
                          <td className="bg-muted/20 p-3 font-bold text-muted-foreground tabular-nums">{num(r.systemQuantity)}</td>
                          <td className="bg-primary/5 p-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!editable || busy}
                              aria-label={`العدد الفعلي لـ ${r.drugName}`}
                              aria-invalid={!valid}
                              className={`w-20 rounded border p-1.5 text-center font-bold text-primary outline-none focus:border-primary disabled:bg-muted disabled:opacity-50 ${valid ? "border-primary/30" : "border-destructive"}`}
                              value={r.actual}
                              onChange={(e) => {
                                const actual = e.target.value;
                                change(r.batchId, {
                                  actual,
                                  // Damage only applies to a shortage.
                                  reasonCode: Number(actual) >= r.systemQuantity && r.reasonCode === "DAMAGE" ? "UNKNOWN" : r.reasonCode,
                                });
                              }}
                            />
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center justify-center rounded px-2 py-1 text-xs font-bold ${diff > 0 ? "bg-success/10 text-success" : diff < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                              <bdi>{diff > 0 ? `+${diff}` : diff}</bdi>
                            </span>
                          </td>
                          <td className="whitespace-nowrap p-3 font-mono font-bold">
                            <bdi className={impact < 0 ? "text-destructive" : impact > 0 ? "text-success" : "text-muted-foreground"}>{num(impact)} د.ع</bdi>
                          </td>
                          <td className="min-w-56 p-3">
                            {diff < 0 && (
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  disabled={!editable || busy}
                                  checked={r.reasonCode === "DAMAGE"}
                                  onChange={(e) => change(r.batchId, { reasonCode: e.target.checked ? "DAMAGE" : "UNKNOWN" })}
                                />
                                هذا النقص ناتج عن تلف مؤكد
                              </label>
                            )}
                            <input
                              aria-label="ملاحظة الجرد الاختيارية"
                              placeholder="ملاحظة (اختياري)"
                              value={r.reason}
                              disabled={!editable || busy}
                              maxLength={2000}
                              className="mt-2 w-full rounded-lg border border-border bg-card p-2 text-sm"
                              onChange={(e) => change(r.batchId, { reason: e.target.value })}
                            />
                            {diff < 0 && r.reasonCode === "DAMAGE" && (
                              <p className="mt-2 text-xs text-muted-foreground">تُسجّل قيمة العجز كمصروف تلف مؤكد عند الاعتماد.</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!visible.length && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">
                          {rows.length ? "لا توجد نتائج بحث" : "لا توجد دفعات في هذا الجرد"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {editable && (
              <div className="flex justify-end gap-4 border-t border-border pt-4">
                <button className={`${btn} px-6 text-muted-foreground`} disabled={busy} onClick={() => void run(() => save(false))}>
                  حفظ كمسودة
                </button>
                <button className={primaryBtn} disabled={busy} onClick={() => void run(() => save(true))}>
                  <CheckCircle2 size={16} /> إنهاء العد وإرسال النتيجة
                </button>
              </div>
            )}
          </>
        )}

        {busy && progress && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="animate-spin" size={20} /> {progress}
          </div>
        )}
      </div>
    </div>
  );
}
