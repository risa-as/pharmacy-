"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  RefreshCw,
  Search,
  ArrowLeft,
  Download,
  Package,
  ChevronDown,
  Calculator,
} from "lucide-react";
import SuggestionDetails from "./suggestion-details";
import { getSmartPurchasingData } from "@/app/lib/actions/purchase-actions";
import {
  baghdadDate,
  DAY,
  dateStart,
  planRow,
  type PlanningOptions,
} from "@/app/lib/smart-purchasing";

type Data = Awaited<ReturnType<typeof getSmartPurchasingData>>;
type Row = ReturnType<typeof planRow>;
type Filter =
  | "action"
  | "out"
  | "urgent"
  | "insufficient"
  | "low"
  | "pending"
  | "review"
  | "all";
const filters: [Filter, string][] = [
  ["action", "يحتاج إجراء"],
  ["out", "نافد"],
  ["urgent", "قبل وصول التوريد"],
  ["insufficient", "لا يغطي المدة"],
  ["low", "أقل من الحد الأدنى"],
  ["pending", "قيد الطلب"],
  ["review", "يحتاج مراجعة"],
  ["all", "الكل"],
];
const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const matches = (r: Row, f: Filter) =>
  f === "all" ||
  (f === "pending"
    ? r.incoming.length > 0
    : f === "review"
      ? r.noDemand || r.qualityReasons.length > 0
      : f === "urgent"
        ? r.urgentUnits > 0
        : r[f]);
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50";
export default function SmartOrderClient({
  branchId: initialBranchId,
  branches,
  userId,
  organizationId,
  canCreate,
  canWarehouse,
  canExport,
}: {
  branchId: string;
  branches: { id: string; name: string }[];
  userId: string;
  organizationId: string;
  canCreate: boolean;
  canWarehouse: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(initialBranchId);
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(
    baghdadDate(new Date(dateStart(baghdadDate()).getTime() - 30 * DAY)),
  );
  const [to, setTo] = useState(
    baghdadDate(new Date(dateStart(baghdadDate()).getTime() - DAY)),
  );
  const [options, setOptions] = useState<PlanningOptions>({
    coverageDays: 15,
    leadDays: 0,
    safetyDays: 0,
    fromArrival: false,
  });
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("action"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, number>>({}),
    [draftReady, setDraftReady] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const version = useRef(0);
  const key = `smart-purchasing:v1:${userId}:${organizationId}:${branchId}`;
  useEffect(() => {
    setDraftReady("");
    setDraft({});
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object")
          setDraft(
            Object.fromEntries(
              Object.entries(saved).filter(
                ([, q]) =>
                  Number.isSafeInteger(q) &&
                  Number(q) >= 0 &&
                  Number(q) <= 1000000,
              ),
            ) as Record<string, number>,
          );
      }
    } catch {
      toast.error("تعذر استعادة مسودة الشراء");
    }
    setDraftReady(key);
  }, [key]);
  useEffect(() => {
    if (draftReady === key)
      try {
        localStorage.setItem(key, JSON.stringify(draft));
      } catch {
        toast.error("تعذر حفظ المسودة على هذا المتصفح");
      }
  }, [draft, key, draftReady]);
  useEffect(() => {
    const request = ++version.current;
    setLoading(true);
    setError("");
    setData(null);
    if (!branchId) {
      setLoading(false);
      return;
    }
    getSmartPurchasingData(branchId, from, to)
      .then((d) => {
        if (request === version.current) setData(d);
      })
      .catch((e) => {
        if (request === version.current)
          setError(e instanceof Error ? e.message : "تعذر تحميل التحليل");
      })
      .finally(() => {
        if (request === version.current) setLoading(false);
      });
    return () => {
      version.current++;
    };
  }, [branchId, from, to, revision]);
  const rows = useMemo(
    () =>
      data?.rows
        .map((r) => planRow(r, options, data.today))
        .sort(
          (a, b) =>
            Number(b.out) - Number(a.out) ||
            b.urgentUnits - a.urgentUnits ||
            (a.coverage ?? Infinity) - (b.coverage ?? Infinity),
        ) || [],
    [data, options],
  );
  const searched = useMemo(
    () =>
      rows.filter((r) =>
        [r.drugName, r.scientificName, r.barcode].some((s) =>
          s.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    [rows, query],
  );
  const filtered = searched.filter((r) => matches(r, filter));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const visible = filtered.slice(
    (Math.min(page, pages) - 1) * 30,
    Math.min(page, pages) * 30,
  );
  useEffect(() => setPage(1), [filter, query, branchId, from, to]);
  const selected = rows.filter((r) => draft[r.inventoryId] !== undefined);
  const blocked = selected.filter(
    (r) => !r.unitsPerPack || draft[r.inventoryId] <= 0,
  );
  const missing = Object.keys(draft).filter(
    (id) => !rows.some((r) => r.inventoryId === id),
  );
  const quantity = (r: Row) => draft[r.inventoryId] ?? r.suggestedQty;
  const actualQuantity = (r: Row) =>
    r.unitsPerPack
      ? Math.ceil(quantity(r) / r.unitsPerPack) * r.unitsPerPack
      : quantity(r);
  const total = selected.reduce(
    (sum, r) => sum + actualQuantity(r) * (r.cost ?? 0),
    0,
  );
  const toggle = (r: Row) =>
    setDraft((prev) => {
      const next = { ...prev };
      if (next[r.inventoryId] !== undefined) delete next[r.inventoryId];
      else next[r.inventoryId] = r.suggestedQty;
      return next;
    });
  function period(value: string) {
    setPreset(value);
    if (value === "custom") return;
    const end = dateStart(baghdadDate());
    setFrom(baghdadDate(new Date(end.getTime() - Number(value) * DAY)));
    setTo(baghdadDate(new Date(end.getTime() - DAY)));
  }
  function exportReport() {
    if (!data || !canExport) return;
    const records: unknown[][] = [
      ["الشراء الذكي", branches.find((b) => b.id === branchId)?.name],
      ["فترة التحليل", data.from, data.to],
      [
        "التغطية",
        options.coverageDays,
        options.fromArrival ? "من الوصول" : "من اليوم",
      ],
      ["التوريد", options.leadDays, "الأمان", options.safetyDays],
      ["وقت التحليل", data.generatedAt],
      ["تنبيه", data.notice],
      [
        "الدواء",
        "الباركود",
        "مبيعات الفترة",
        "مرتجعات مرتبطة",
        "أيام الرصد",
        "المعدل اليومي",
        "المتاح",
        "القادم",
        "اقتراح وحدات المخزون",
        "اختيارك وحدات المخزون",
        "باكيتات",
        "التكلفة التقديرية",
        "ملاحظات",
      ],
    ];
    for (const r of selected.length ? selected : filtered)
      records.push([
        r.drugName,
        r.barcode,
        r.sold,
        r.returned,
        r.observedDays,
        r.averageDailySales,
        r.currentStock,
        r.pending,
        r.suggestedQty,
        quantity(r),
        r.unitsPerPack
          ? Math.ceil(quantity(r) / r.unitsPerPack)
          : "تعبئة غير مؤكدة",
        r.cost === null ? "سعر غير متوفر" : actualQuantity(r) * r.cost,
        r.qualityReasons.join("؛ "),
      ]);
    const csv =
      "\uFEFF" +
      records
        .map((row) =>
          row
            .map((v) => {
              let s = String(v ?? "");
              if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
              return '"' + s.replace(/"/g, '""') + '"';
            })
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-purchasing-${data.today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function review() {
    if (
      !data ||
      loading ||
      blocked.length ||
      missing.length ||
      !selected.length ||
      selected.length > 500 ||
      !canCreate ||
      !canWarehouse
    )
      return;
    const handoff = {
      version: 1,
      branchId,
      generatedAt: data.generatedAt,
      lines: selected.map((r) => ({
        drugId: r.drugId,
        tradeName: r.drugName,
        barcode: r.barcode,
        scientificName: r.scientificName,
        currentStock: r.currentStock,
        quantity: Math.ceil(quantity(r) / r.unitsPerPack!),
        unitsPerPack: r.unitsPerPack,
      })),
    };
    try {
      sessionStorage.setItem(
        `smart-purchasing-handoff:${userId}:${organizationId}`,
        JSON.stringify(handoff),
      );
      router.push("/dashboard/purchases/warehouse-orders/new");
    } catch {
      toast.error("تعذر حفظ مسودة الطلب");
    }
  }
  return (
    <div dir="rtl" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="text-primary" />
            الشراء الذكي
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            حدد فترة البيع والتغطية المطلوبة، ثم راجع احتياجك قبل الشراء.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={button}
            onClick={() => setRevision((r) => r + 1)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            تحديث
          </button>
          <button
            className={button}
            onClick={exportReport}
            disabled={!data || loading || !canExport}
          >
            <Download size={15} />
            تصدير التقرير
          </button>
        </div>
      </div>
      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2 text-xs font-semibold">
          <span>الفرع</span>
          <select
            className={`${field} block w-full`}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {!branchId && <option value="">اختر الفرع</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-xs font-semibold">
          <span>فترة تحليل المبيعات</span>
          <select
            className={`${field} block w-full`}
            value={preset}
            onChange={(e) => period(e.target.value)}
          >
            <option value="7">آخر 7 أيام</option>
            <option value="15">آخر 15 يوماً</option>
            <option value="30">آخر 30 يوماً</option>
            <option value="custom">فترة مخصصة</option>
          </select>
        </label>
        <label className="space-y-2 text-xs font-semibold">
          <span>أريد أن يكفيني المخزون (يوم)</span>
          <input
            className={`${field} block w-full`}
            type="number"
            min="1"
            max="365"
            value={options.coverageDays}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                coverageDays: Math.max(
                  1,
                  Math.min(365, Math.trunc(Number(e.target.value) || 1)),
                ),
              }))
            }
          />
        </label>
        <label className="space-y-2 text-xs font-semibold">
          <span>تبدأ التغطية</span>
          <select
            className={`${field} block w-full`}
            value={String(options.fromArrival)}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                fromArrival: e.target.value === "true",
              }))
            }
          >
            <option value="false">من اليوم</option>
            <option value="true">من وصول الطلب</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className="text-xs">
              من
              <input
                aria-label="بداية فترة التحليل"
                className={`${field} mt-2 block w-full`}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs">
              إلى
              <input
                aria-label="نهاية فترة التحليل"
                className={`${field} mt-2 block w-full`}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="text-xs">
          مدة وصول الطلب الجديد (يوم)
          <input
            className={`${field} mt-2 block w-full`}
            type="number"
            min="0"
            max="180"
            aria-describedby="lead-help"
            value={options.leadDays}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                leadDays: Math.max(
                  0,
                  Math.min(180, Math.trunc(Number(e.target.value) || 0)),
                ),
              }))
            }
          />
          <span
            id="lead-help"
            className="mt-2 block text-xs leading-5 text-muted-foreground"
          >
            الوقت من إرسال الطلب حتى وصوله. يساعد على كشف النقص قبل الوصول؛ 0
            يعني وصولاً اليوم.
          </span>
        </label>
        <label className="text-xs">
          مخزون أمان إضافي (يوم)
          <input
            className={`${field} mt-2 block w-full`}
            type="number"
            min="0"
            max="90"
            aria-describedby="safety-help"
            value={options.safetyDays}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                safetyDays: Math.max(
                  0,
                  Math.min(90, Math.trunc(Number(e.target.value) || 0)),
                ),
              }))
            }
          />
          <span
            id="safety-help"
            className="mt-2 block text-xs leading-5 text-muted-foreground"
          >
            احتياطي فوق التغطية المطلوبة لمواجهة زيادة البيع أو تأخر التوريد؛ 0
            يعني دون احتياطي.
          </span>
        </label>
        <p className="self-end text-xs leading-6 text-muted-foreground sm:col-span-2">
          التحليل:{" "}
          <b dir="ltr">
            {from} — {to}
          </b>{" "}
          (أيام مكتملة). الكميات بوحدة المخزون، وتحوّل إلى باكيتات عند مراجعة
          الطلب. أدخل مدة الوصول المتوقعة؛ القيمة 0 تعني وصولًا اليوم.
        </p>
      </section>
      {data && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-6 text-muted-foreground">
          {data.notice} آخر تحديث:{" "}
          {new Date(data.generatedAt).toLocaleString("ar-IQ-u-nu-latn")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["نافد", rows.filter((r) => r.out).length, "out"],
          [
            "لا يغطي المدة",
            rows.filter((r) => r.insufficient).length,
            "insufficient",
          ],
          [
            "قيد الطلب",
            rows.filter((r) => r.incoming.length > 0).length,
            "pending",
          ],
          ["قيمة المختارات تقديرياً", `${fmt(total)} د.ع`, null],
        ].map(([label, value, f]) => (
          <button
            key={String(label)}
            type="button"
            className="rounded-lg border bg-card p-4 text-right"
            onClick={() => f && setFilter(f as Filter)}
            disabled={loading || !f}
          >
            <span className="block text-xs text-muted-foreground">{label}</span>
            <strong className="mt-2 block text-xl tabular-nums">
              {loading ? "—" : value}
            </strong>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="absolute right-3 top-3 text-muted-foreground"
          />
          <input
            aria-label="بحث الأدوية"
            placeholder="اسم الدواء، الاسم العلمي، الباركود"
            className={`${field} w-full pr-9`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className={button}
          disabled={loading}
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              ...Object.fromEntries(
                filtered
                  .filter(
                    (r) =>
                      r.suggestedQty > 0 &&
                      r.unitsPerPack &&
                      !r.qualityReasons.length,
                  )
                  .map((r) => [
                    r.inventoryId,
                    prev[r.inventoryId] ?? r.suggestedQty,
                  ]),
              ),
            }))
          }
        >
          تحديد المؤهل من النتائج (
          {
            filtered.filter(
              (r) =>
                r.suggestedQty > 0 &&
                r.unitsPerPack &&
                !r.qualityReasons.length,
            ).length
          }
          )
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`${button} ${filter === f ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}
          >
            {label}
            <span className="tabular-nums">
              {loading ? "—" : searched.filter((r) => matches(r, f)).length}
            </span>
          </button>
        ))}
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 p-5 text-destructive"
        >
          {error}
        </div>
      ) : loading ? (
        <div role="status" className="rounded-lg border p-12 text-center">
          جاري تحليل المبيعات والمخزون والطلبات…
        </div>
      ) : (
        <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
          <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1.4fr_1fr] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-semibold xl:grid">
            <span>الدواء</span>
            <span>المتاح / التغطية</span>
            <span>مبيعات الفترة</span>
            <span>القادم</span>
            <span>كمية الطلب</span>
            <span>التكلفة</span>
          </div>
          {!visible.length && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Package size={34} />
              <p>لا توجد أصناف تطابق هذا الفلتر</p>
              <button
                className={button}
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                عرض جميع الأصناف
              </button>
            </div>
          )}
          {visible.map((r) => (
            <article key={r.inventoryId} className="border-b last:border-0">
              <div className="grid min-w-0 grid-cols-2 items-start gap-4 p-4 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1.4fr_1fr]">
                <div className="col-span-2 flex min-w-0 items-start gap-2 xl:col-span-1">
                  <input
                    aria-label={`اختيار ${r.drugName}`}
                    type="checkbox"
                    className="mt-1"
                    checked={draft[r.inventoryId] !== undefined}
                    onChange={() => toggle(r)}
                  />
                  <div className="min-w-0">
                    <b className="break-words text-sm">{r.drugName}</b>
                    <p
                      dir="ltr"
                      className="mt-1 truncate text-right text-xs text-muted-foreground"
                      title={r.barcode}
                    >
                      {r.barcode}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      وحدة المخزون
                      {r.unitsPerPack
                        ? ` · الباكيت ${r.unitsPerPack} وحدات`
                        : " · التعبئة تحتاج تأكيداً"}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground xl:hidden">
                    المتاح
                  </span>
                  <strong className={r.out ? "text-destructive" : ""}>
                    {fmt(r.currentStock)}
                  </strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.coverage === null
                      ? "التغطية غير قابلة للتقدير"
                      : `يكفي ${fmt(r.coverage)} يوم`}
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground xl:hidden">
                    صافي مبيعات الفترة
                  </span>
                  <b>{fmt(r.netSales)}</b>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmt(r.averageDailySales)} / يوم · {r.observedDays} يوم رصد
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground xl:hidden">
                    القادم
                  </span>
                  <b>{fmt(r.pending)}</b>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.incoming.length
                      ? r.incoming.some((l) => !l.confirmed)
                        ? "بعضه غير مؤكد الوصول"
                        : "وارد مؤكد بموعد"
                      : "لا توجد كميات موثقة"}
                  </p>
                </div>
                <div>
                  <label className="text-xs">
                    وحدات المخزون
                    <input
                      aria-label={`كمية ${r.drugName}`}
                      type="number"
                      min="0"
                      max="1000000"
                      className={`${field} mt-1 w-full`}
                      value={quantity(r)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [r.inventoryId]: Math.max(
                            0,
                            Math.min(
                              1000000,
                              Math.trunc(Number(e.target.value) || 0),
                            ),
                          ),
                        }))
                      }
                    />
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    المقترح: {fmt(r.suggestedQty)}
                    {r.unitsPerPack
                      ? ` · ${fmt(Math.ceil(quantity(r) / r.unitsPerPack))} باكيت`
                      : ""}
                  </p>
                  {r.noDemand && (
                    <button
                      className="mt-1 text-xs text-primary"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          [r.inventoryId]: Math.max(
                            0,
                            r.minStock - r.currentStock,
                          ),
                        }))
                      }
                    >
                      استكمال الحد الأدنى (
                      {Math.max(0, r.minStock - r.currentStock)})
                    </button>
                  )}
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground xl:hidden">
                    التكلفة التقديرية
                  </span>
                  <b className="text-sm">
                    {r.cost === null
                      ? "سعر غير متوفر"
                      : `${fmt(actualQuantity(r) * r.cost)} د.ع`}
                  </b>
                  <button
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-controls={`suggestion-${r.inventoryId}`}
                    aria-expanded={expanded === r.inventoryId}
                    onClick={() =>
                      setExpanded(
                        expanded === r.inventoryId ? null : r.inventoryId,
                      )
                    }
                  >
                    <Calculator size={14} className="shrink-0" />
                    سبب الاقتراح
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-transform ${expanded === r.inventoryId ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              </div>
              {expanded === r.inventoryId && (
                <SuggestionDetails
                  row={r}
                  options={options}
                  quantity={quantity(r)}
                  actualQuantity={actualQuantity(r)}
                />
              )}
            </article>
          ))}
          <div className="flex items-center justify-between p-3 text-xs">
            <span>
              {filtered.length} صنف · صفحة {Math.min(page, pages)} من {pages}
            </span>
            <div className="flex gap-2">
              <button
                className={button}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </button>
              <button
                className={button}
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </button>
            </div>
          </div>
        </section>
      )}
      <footer className="sticky bottom-3 z-10 space-y-2 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            المختار <b>{selected.length}</b> · التقدير <b>{fmt(total)} د.ع</b>
            <span className="mr-2 text-xs text-muted-foreground">
              ({selected.filter((r) => r.cost !== null).length} مسعّر) ·{" "}
              {
                selected.filter(
                  (r) => !filtered.some((f) => f.inventoryId === r.inventoryId),
                ).length
              }{" "}
              خارج الفلتر
            </span>
          </p>
          <div className="flex gap-2">
            <button className={button} onClick={() => setDraft({})}>
              مسح الاختيار
            </button>
            <button
              className={`${button} bg-primary text-primary-foreground`}
              onClick={review}
              disabled={
                loading ||
                !canCreate ||
                !canWarehouse ||
                !selected.length ||
                selected.length > 500 ||
                !!blocked.length ||
                !!missing.length
              }
            >
              مراجعة الطلب <ArrowLeft size={15} />
            </button>
          </div>
        </div>
        {selected.length > 500 && (
          <p className="text-xs text-warning">
            اختر حتى 500 صنف في المسودة الواحدة.
          </p>
        )}
        {blocked.length > 0 && (
          <p className="text-xs text-warning">
            {blocked.length} صنف يحتاج كمية موجبة أو تأكيد التعبئة قبل التحويل.{" "}
            <Link className="underline" href="/dashboard/inventory/pack-units">
              تأكيد التعبئة
            </Link>
          </p>
        )}
        {missing.length > 0 && (
          <p className="text-xs text-warning">
            توجد مختارات سابقة غير متاحة في البيانات الحالية؛ راجعها أو امسح
            الاختيار.
          </p>
        )}
        {!canCreate && (
          <p className="text-xs text-muted-foreground">
            حسابك لا يملك صلاحية إنشاء المشتريات.
          </p>
        )}
        {!canWarehouse && (
          <p className="text-xs text-muted-foreground">
            يمكنك تصدير الاحتياج؛ طلبات المذاخر تتطلب تفعيل الميزة في الباقة.{" "}
            <Link href="/dashboard/purchases" className="underline">
              المشتريات الداخلية
            </Link>
          </p>
        )}
      </footer>
    </div>
  );
}
