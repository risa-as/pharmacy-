"use client";

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): العميل التفاعلي لصفحة
// التقارير — سبعة تقارير مقسّمة بتبويبات، كل تبويب يجلب بياناته من مسار GET
// المطابق تحت app/api/warehouse-portal/reports/*. القسمان "الهوامش" و"العملاء"
// يُخفيان بالكامل عند canViewFinance/canViewCustomers=false — هذه الخاصيتان
// محسومتان من الخادم (app/warehouse/reports/page.tsx عبر استعلام Prisma حي)
// لا من تخمين العميل، فإخفاؤهما هنا فعلي لا مجرد CSS. لا مكتبة رسوم بيانية
// (القيد §8 من هذه المرحلة) — كل التمثيل المرئي أدناه CSS/divs بسيطة.
import { useEffect, useState, useCallback } from "react";
import { Download } from "lucide-react";
import { exportToExcel } from "@/app/lib/excel-export";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import LoadingBlock from "@/app/warehouse/_components/Loading";
import StatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";

type Period = "day" | "week" | "month";
type TabId = "sales" | "top-sellers" | "slow-movers" | "fulfilment" | "expiry-risk" | "margins" | "customers" | "payables" | "reps";

interface SalesPoint {
    key: string;
    total: number;
    orders: number;
    quantity: number;
}
interface TopSellerRow {
    barcode: string;
    tradeName: string;
    quantity: number;
    total: number;
}
interface SlowMoverRow {
    barcode: string;
    tradeName: string;
    lastSoldAt: string | null;
    daysSince: number | null;
}
interface FulfilmentResult {
    fullyFilled: number;
    partial: number;
    outOfStock: number;
    totalLines: number;
    ratePercent: number;
}
interface MarginRow {
    barcode: string;
    tradeName: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number | null;
}
type ExpiryBucketKey = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";
interface ExpiryBucketTotal {
    quantity: number;
    value: number;
}
interface ExpiryItem {
    tradeName: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    value: number;
    bucket: ExpiryBucketKey;
}
interface ExpiryResult {
    byBucket: Record<ExpiryBucketKey, ExpiryBucketTotal>;
    items: ExpiryItem[];
}
interface CustomerSalesRow {
    organizationId: string;
    pharmacyName: string;
    total: number;
    orders: number;
    lastOrderAt: string;
}

// مشتريات المذخر وذممه الدائنة: نفس فئات التقادم المُعرَّفة في
// app/lib/warehouse-accounts.ts (agingBucket) — مُعاد تعريفها هنا كنوع
// عرض بحت (لا استيراد من warehouse-accounts.ts، فهذا الملف عميل ("use client")
// يستهلك القيم الجاهزة من GET /api/warehouse-portal/reports/payables فقط،
// نفس أسلوب AccountsClient.tsx).
type PayablesAgingBucket = "CURRENT" | "D30" | "D60" | "D90" | "D90_PLUS";
interface PayablesSummary {
    outstanding: number;
    overdue: number;
    byBucket: Record<PayablesAgingBucket, number>;
}
interface PayablesSupplierRow {
    supplierId: string;
    supplierName: string;
    outstanding: number;
    overdue: number;
    bucket: PayablesAgingBucket;
}

// المندوبون: صف أداء مندوب واحد ضمن الفترة المطلوبة — نفس شكل استجابة
// GET /api/warehouse-portal/reports/reps بالضبط (بلا استيراد من warehouse-reps.ts،
// هذا الملف عميل يستهلك القيم الجاهزة فقط، نفس أسلوب بقية هذا الملف).
type CommissionBasisLabel = "SALES" | "PROFIT" | "COLLECTION";
interface RepPerformanceRow {
    repId: string;
    name: string;
    commissionBasis: CommissionBasisLabel;
    commissionRate: number;
    salesTotal: number;
    profitTotal: number;
    collectedTotal: number;
    commission: { base: number; amount: number };
}

const COMMISSION_BASIS_LABEL: Record<CommissionBasisLabel, string> = {
    SALES: "على المبيعات",
    PROFIT: "على الربح",
    COLLECTION: "على التحصيل",
};

const RANGE_OPTIONS = [
    { label: "30 يوم", days: 30 },
    { label: "90 يوم", days: 90 },
    { label: "180 يوم", days: 180 },
    { label: "سنة", days: 365 },
];

function fmt(n: number): string {
    return Math.round(n).toLocaleString("ar-IQ");
}

function rangeToFromTo(days: number): { from: string; to: string } {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
}

/** عمود بارات عمودية بسيط (CSS) — كل بار مُعنون برقمه الفعلي فوقه، لا بالتلميح فقط. */
function VerticalBars({
    data,
    valueOf,
    labelOf,
    color,
}: {
    data: SalesPoint[];
    valueOf: (d: SalesPoint) => number;
    labelOf: (d: SalesPoint) => string;
    color: string;
}) {
    const max = Math.max(1, ...data.map(valueOf));
    if (data.length === 0) {
        return <p className="p-4 text-sm text-muted-foreground">لا توجد بيانات مبيعات ضمن هذه الفترة.</p>;
    }
    return (
        <div className="overflow-x-auto">
            <div className="flex items-end gap-2 px-1 py-3" style={{ minHeight: 170 }}>
                {data.map((d, i) => {
                    const v = valueOf(d);
                    const h = Math.max(Math.round((v / max) * 120), v > 0 ? 3 : 0);
                    return (
                        <div key={i} className="flex shrink-0 flex-col items-center gap-1" style={{ width: 46 }}>
                            <span className="tabular-nums text-[11px] text-foreground">{fmt(v)}</span>
                            <div className={`w-6 rounded-t-sm ${color}`} style={{ height: h }} title={`${d.key}: ${fmt(v)}`} />
                            <span className="whitespace-nowrap text-[10px] text-muted-foreground">{labelOf(d)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// شارة الفئة (variant) توحَّد الآن عبر StatusChip المشترك (تلوين مخفَّف
// bg-X/10 + text-X، لا تعبئة مصمتة) — نفس السبب الذي دفع أصلاً لتفادي
// text-white هنا (ألوان bg-warning/bg-info تنقلب لدرجة أفتح في الوضع الداكن،
// انظر packages/shared/tailwind.config)، والتلوين المخفَّف يبقى مقروءاً بلا
// حاجة لمتغيرات X-foreground إطلاقاً.
const EXPIRY_BUCKET_META: Array<{ key: ExpiryBucketKey; label: string; bar: string; dot: string; variant: StatusChipVariant }> = [
    { key: "EXPIRED", label: "منتهي", bar: "bg-destructive", dot: "bg-destructive", variant: "danger" },
    { key: "CRITICAL", label: "حرج (≤90 يوم)", bar: "bg-warning", dot: "bg-warning", variant: "warning" },
    { key: "WARNING", label: "قارب الانتهاء (≤180 يوم)", bar: "bg-info", dot: "bg-info", variant: "info" },
    { key: "OK", label: "سليم", bar: "bg-success", dot: "bg-success", variant: "success" },
];

function ExpiryBucketBars({ byBucket }: { byBucket: Record<ExpiryBucketKey, ExpiryBucketTotal> }) {
    const max = Math.max(1, ...EXPIRY_BUCKET_META.map((m) => byBucket[m.key]?.value ?? 0));
    return (
        <div className="space-y-2.5 p-4">
            {EXPIRY_BUCKET_META.map((m) => {
                const b = byBucket[m.key] ?? { quantity: 0, value: 0 };
                const widthPct = Math.max(Math.round((b.value / max) * 100), b.value > 0 ? 2 : 0);
                return (
                    <div key={m.key} className="flex items-center gap-3">
                        <span className="flex w-40 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                            {m.label}
                        </span>
                        <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                            <div className={`h-full ${m.bar}`} style={{ width: `${widthPct}%` }} />
                        </div>
                        <span className="tabular-nums w-52 shrink-0 text-xs text-foreground">
                            {fmt(b.value)} د.ع · {fmt(b.quantity)} وحدة
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function ExportButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-success-foreground transition-colors hover:bg-success/90"
        >
            <Download className="h-3 w-3" /> تصدير Excel
        </button>
    );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <h3 className="font-bold">{title}</h3>
                {action}
            </div>
            {children}
        </div>
    );
}

function RangePicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
    return (
        <div className="flex items-center gap-1.5">
            {RANGE_OPTIONS.map((o) => (
                <button
                    key={o.days}
                    onClick={() => onChange(o.days)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        value === o.days ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function LoadingRow() {
    return <LoadingBlock />;
}
function ErrorRow({ message }: { message: string }) {
    return <div className="p-6 text-center text-sm text-destructive">{message}</div>;
}

export default function ReportsClient({
    canViewFinance,
    canViewCustomers,
    canViewPayables,
    canViewReps,
}: {
    canViewFinance: boolean;
    canViewCustomers: boolean;
    canViewPayables: boolean;
    canViewReps: boolean;
}) {
    const tabs: Array<{ id: TabId; label: string }> = [
        { id: "sales", label: "المبيعات" },
        { id: "top-sellers", label: "الأكثر مبيعاً" },
        { id: "slow-movers", label: "الأصناف الراكدة" },
        { id: "fulfilment", label: "نسبة التلبية" },
        { id: "expiry-risk", label: "مخاطر الصلاحية" },
    ];
    if (canViewFinance) tabs.push({ id: "margins", label: "الهوامش" });
    if (canViewCustomers) tabs.push({ id: "customers", label: "مبيعات العملاء" });
    // مشتريات المذخر وذممه الدائنة: يتطلب canViewFinance **و** canViewPurchases
    // معاً — canViewPayables محسومة من الخادم في app/warehouse/reports/page.tsx
    // (AND الفعلي)، فهذا الشرط هنا واجهة فقط تطابق البوابة الحقيقية على
    // GET /api/warehouse-portal/reports/payables.
    if (canViewPayables) tabs.push({ id: "payables", label: "الذمم الدائنة" });
    // المندوبون: يتطلب canViewReports **و** canViewReps معاً — canViewReps هنا
    // محسومة من الخادم في app/warehouse/reports/page.tsx (AND الفعلي)، مطابقة
    // للبوابة الحقيقية على GET /api/warehouse-portal/reports/reps.
    if (canViewReps) tabs.push({ id: "reps", label: "المندوبون" });

    const [tab, setTab] = useState<TabId>("sales");

    // ── المبيعات بفترة ────────────────────────────────────────────────────
    const [period, setPeriod] = useState<Period>("day");
    const [salesRangeDays, setSalesRangeDays] = useState(90);
    const [salesData, setSalesData] = useState<SalesPoint[] | null>(null);
    const [salesLoading, setSalesLoading] = useState(false);
    const [salesError, setSalesError] = useState<string | null>(null);

    const loadSales = useCallback(async () => {
        setSalesLoading(true);
        setSalesError(null);
        try {
            const { from, to } = rangeToFromTo(salesRangeDays);
            const res = await fetch(
                `/api/warehouse-portal/reports/sales?period=${period}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير المبيعات");
            setSalesData(data.series);
        } catch (e: any) {
            setSalesError(e?.message || "فشل تحميل تقرير المبيعات");
        } finally {
            setSalesLoading(false);
        }
    }, [period, salesRangeDays]);

    // ── الأكثر مبيعاً ─────────────────────────────────────────────────────
    const [topBy, setTopBy] = useState<"value" | "quantity">("value");
    const [topLimit, setTopLimit] = useState(10);
    const [topData, setTopData] = useState<TopSellerRow[] | null>(null);
    const [topLoading, setTopLoading] = useState(false);
    const [topError, setTopError] = useState<string | null>(null);

    const loadTopSellers = useCallback(async () => {
        setTopLoading(true);
        setTopError(null);
        try {
            const { from, to } = rangeToFromTo(salesRangeDays);
            const res = await fetch(
                `/api/warehouse-portal/reports/top-sellers?by=${topBy}&limit=${topLimit}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير الأكثر مبيعاً");
            setTopData(data.items);
        } catch (e: any) {
            setTopError(e?.message || "فشل تحميل تقرير الأكثر مبيعاً");
        } finally {
            setTopLoading(false);
        }
    }, [topBy, topLimit, salesRangeDays]);

    // ── الأصناف الراكدة ───────────────────────────────────────────────────
    const [slowDays, setSlowDays] = useState(90);
    const [slowData, setSlowData] = useState<SlowMoverRow[] | null>(null);
    const [slowLoading, setSlowLoading] = useState(false);
    const [slowError, setSlowError] = useState<string | null>(null);

    const loadSlowMovers = useCallback(async () => {
        setSlowLoading(true);
        setSlowError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/reports/slow-movers?days=${slowDays}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير الأصناف الراكدة");
            setSlowData(data.items);
        } catch (e: any) {
            setSlowError(e?.message || "فشل تحميل تقرير الأصناف الراكدة");
        } finally {
            setSlowLoading(false);
        }
    }, [slowDays]);

    // ── نسبة التلبية ──────────────────────────────────────────────────────
    const [fulfilmentRangeDays, setFulfilmentRangeDays] = useState(90);
    const [fulfilmentData, setFulfilmentData] = useState<FulfilmentResult | null>(null);
    const [fulfilmentLoading, setFulfilmentLoading] = useState(false);
    const [fulfilmentError, setFulfilmentError] = useState<string | null>(null);

    const loadFulfilment = useCallback(async () => {
        setFulfilmentLoading(true);
        setFulfilmentError(null);
        try {
            const { from, to } = rangeToFromTo(fulfilmentRangeDays);
            const res = await fetch(
                `/api/warehouse-portal/reports/fulfilment?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير نسبة التلبية");
            setFulfilmentData(data);
        } catch (e: any) {
            setFulfilmentError(e?.message || "فشل تحميل تقرير نسبة التلبية");
        } finally {
            setFulfilmentLoading(false);
        }
    }, [fulfilmentRangeDays]);

    // ── مخاطر الصلاحية ────────────────────────────────────────────────────
    const [expiryData, setExpiryData] = useState<ExpiryResult | null>(null);
    const [expiryLoading, setExpiryLoading] = useState(false);
    const [expiryError, setExpiryError] = useState<string | null>(null);

    const loadExpiryRisk = useCallback(async () => {
        setExpiryLoading(true);
        setExpiryError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/reports/expiry-risk`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير مخاطر الصلاحية");
            setExpiryData(data);
        } catch (e: any) {
            setExpiryError(e?.message || "فشل تحميل تقرير مخاطر الصلاحية");
        } finally {
            setExpiryLoading(false);
        }
    }, []);

    // ── الهوامش (canViewFinance فقط) ──────────────────────────────────────
    const [marginRangeDays, setMarginRangeDays] = useState(90);
    const [marginData, setMarginData] = useState<MarginRow[] | null>(null);
    const [marginLoading, setMarginLoading] = useState(false);
    const [marginError, setMarginError] = useState<string | null>(null);

    const loadMargins = useCallback(async () => {
        if (!canViewFinance) return;
        setMarginLoading(true);
        setMarginError(null);
        try {
            const { from, to } = rangeToFromTo(marginRangeDays);
            const res = await fetch(
                `/api/warehouse-portal/reports/margins?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير الهوامش");
            setMarginData(data.items);
        } catch (e: any) {
            setMarginError(e?.message || "فشل تحميل تقرير الهوامش");
        } finally {
            setMarginLoading(false);
        }
    }, [marginRangeDays, canViewFinance]);

    // ── مبيعات العملاء (canViewCustomers فقط) ─────────────────────────────
    const [customerRangeDays, setCustomerRangeDays] = useState(90);
    const [customerData, setCustomerData] = useState<CustomerSalesRow[] | null>(null);
    const [customerLoading, setCustomerLoading] = useState(false);
    const [customerError, setCustomerError] = useState<string | null>(null);

    const loadCustomers = useCallback(async () => {
        if (!canViewCustomers) return;
        setCustomerLoading(true);
        setCustomerError(null);
        try {
            const { from, to } = rangeToFromTo(customerRangeDays);
            const res = await fetch(
                `/api/warehouse-portal/reports/customers?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير مبيعات العملاء");
            setCustomerData(data.items);
        } catch (e: any) {
            setCustomerError(e?.message || "فشل تحميل تقرير مبيعات العملاء");
        } finally {
            setCustomerLoading(false);
        }
    }, [customerRangeDays, canViewCustomers]);

    // ── الذمم الدائنة (canViewPayables فقط) — رصيد حي، لا فترة زمنية ───────
    const [payablesSummary, setPayablesSummary] = useState<PayablesSummary | null>(null);
    const [payablesSuppliers, setPayablesSuppliers] = useState<PayablesSupplierRow[] | null>(null);
    const [payablesLoading, setPayablesLoading] = useState(false);
    const [payablesError, setPayablesError] = useState<string | null>(null);

    const loadPayables = useCallback(async () => {
        if (!canViewPayables) return;
        setPayablesLoading(true);
        setPayablesError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/reports/payables`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير الذمم الدائنة");
            setPayablesSummary(data.summary);
            setPayablesSuppliers(data.suppliers);
        } catch (e: any) {
            setPayablesError(e?.message || "فشل تحميل تقرير الذمم الدائنة");
        } finally {
            setPayablesLoading(false);
        }
    }, [canViewPayables]);

    // ── المندوبون (canViewReps فقط) ────────────────────────────────────────
    const [repsRangeDays, setRepsRangeDays] = useState(30);
    const [repsData, setRepsData] = useState<RepPerformanceRow[] | null>(null);
    const [repsLoading, setRepsLoading] = useState(false);
    const [repsError, setRepsError] = useState<string | null>(null);

    const loadReps = useCallback(async () => {
        if (!canViewReps) return;
        setRepsLoading(true);
        setRepsError(null);
        try {
            const { from, to } = rangeToFromTo(repsRangeDays);
            const res = await fetch(
                `/api/warehouse-portal/reports/reps?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تقرير المندوبين");
            setRepsData(data.reps);
        } catch (e: any) {
            setRepsError(e?.message || "فشل تحميل تقرير المندوبين");
        } finally {
            setRepsLoading(false);
        }
    }, [repsRangeDays, canViewReps]);

    useEffect(() => {
        if (tab === "sales") loadSales();
        if (tab === "top-sellers") loadTopSellers();
        if (tab === "slow-movers") loadSlowMovers();
        if (tab === "fulfilment") loadFulfilment();
        if (tab === "expiry-risk") loadExpiryRisk();
        if (tab === "margins") loadMargins();
        if (tab === "customers") loadCustomers();
        if (tab === "payables") loadPayables();
        if (tab === "reps") loadReps();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, loadSales, loadTopSellers, loadSlowMovers, loadFulfilment, loadExpiryRisk, loadMargins, loadCustomers, loadPayables, loadReps]);

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader title="التقارير" description="أداء مبيعاتك، أصنافك الراكدة، مخاطر الصلاحية، ونسبة تلبية طلبات صيدلياتك." />

            <div className="flex flex-wrap gap-1 border-b">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                            tab === t.id
                                ? "border-b-2 border-primary text-primary"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === "sales" && (
                <SectionCard
                    title="إجمالي المبيعات بفترة"
                    action={
                        salesData && salesData.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        salesData,
                                        [
                                            { header: "الفترة", key: "key", width: 16 },
                                            { header: "الإجمالي", key: "total", width: 14 },
                                            { header: "عدد الطلبات", key: "orders", width: 14 },
                                            { header: "الكمية", key: "quantity", width: 12 },
                                        ],
                                        "تقرير_المبيعات",
                                        "المبيعات"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                        <div className="flex items-center gap-1.5">
                            {(["day", "week", "month"] as Period[]).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                        period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                                    }`}
                                >
                                    {p === "day" ? "يومي" : p === "week" ? "أسبوعي" : "شهري"}
                                </button>
                            ))}
                        </div>
                        <RangePicker value={salesRangeDays} onChange={setSalesRangeDays} />
                    </div>
                    {salesLoading && <LoadingRow />}
                    {salesError && <ErrorRow message={salesError} />}
                    {!salesLoading && !salesError && salesData && (
                        <>
                            <VerticalBars
                                data={salesData}
                                valueOf={(d) => d.total}
                                labelOf={(d) => (period === "day" ? d.key.slice(5) : period === "month" ? d.key : d.key.slice(5))}
                                color="bg-primary"
                            />
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-t bg-muted text-right text-xs text-muted-foreground">
                                            <th className="p-2.5 font-medium">الفترة</th>
                                            <th className="p-2.5 font-medium">الإجمالي (د.ع)</th>
                                            <th className="p-2.5 font-medium">عدد الطلبات</th>
                                            <th className="p-2.5 font-medium">الكمية</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {salesData.map((d) => (
                                            <tr key={d.key} className="border-t">
                                                <td className="p-2.5">{d.key}</td>
                                                <td className="tabular-nums p-2.5">{fmt(d.total)}</td>
                                                <td className="tabular-nums p-2.5">{fmt(d.orders)}</td>
                                                <td className="tabular-nums p-2.5">{fmt(d.quantity)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </SectionCard>
            )}

            {tab === "top-sellers" && (
                <SectionCard
                    title="الأكثر مبيعاً"
                    action={
                        topData && topData.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        topData,
                                        [
                                            { header: "الاسم التجاري", key: "tradeName", width: 26 },
                                            { header: "الباركود", key: "barcode", width: 18 },
                                            { header: "الكمية", key: "quantity", width: 12 },
                                            { header: "الإجمالي", key: "total", width: 14 },
                                        ],
                                        "تقرير_الأكثر_مبيعاً",
                                        "الأكثر مبيعاً"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                        <div className="flex items-center gap-1.5">
                            {(["value", "quantity"] as const).map((b) => (
                                <button
                                    key={b}
                                    onClick={() => setTopBy(b)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                        topBy === b ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                                    }`}
                                >
                                    {b === "value" ? "بالقيمة" : "بالكمية"}
                                </button>
                            ))}
                            <select
                                value={topLimit}
                                onChange={(e) => setTopLimit(Number(e.target.value))}
                                className="rounded-lg border bg-card px-2 py-1.5 text-xs"
                            >
                                {[10, 20, 50].map((n) => (
                                    <option key={n} value={n}>
                                        أعلى {n}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <RangePicker value={salesRangeDays} onChange={setSalesRangeDays} />
                    </div>
                    {topLoading && <LoadingRow />}
                    {topError && <ErrorRow message={topError} />}
                    {!topLoading && !topError && topData && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted text-right text-xs text-muted-foreground">
                                        <th className="p-2.5 font-medium">#</th>
                                        <th className="p-2.5 font-medium">الاسم التجاري</th>
                                        <th className="p-2.5 font-medium">الكمية</th>
                                        <th className="p-2.5 font-medium">الإجمالي (د.ع)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topData.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                لا توجد مبيعات ضمن هذه الفترة.
                                            </td>
                                        </tr>
                                    )}
                                    {topData.map((r, i) => (
                                        <tr key={r.barcode} className="border-t">
                                            <td className="tabular-nums p-2.5 text-muted-foreground">{i + 1}</td>
                                            <td className="p-2.5">{r.tradeName}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.quantity)}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {tab === "slow-movers" && (
                <SectionCard
                    title="الأصناف الراكدة"
                    action={
                        slowData && slowData.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        slowData.map((r) => ({
                                            ...r,
                                            lastSoldAt: r.lastSoldAt ? new Date(r.lastSoldAt) : "لم يُبَع أبداً",
                                            daysSince: r.daysSince ?? "—",
                                        })),
                                        [
                                            { header: "الاسم التجاري", key: "tradeName", width: 26 },
                                            { header: "الباركود", key: "barcode", width: 18 },
                                            { header: "آخر بيع", key: "lastSoldAt", width: 16 },
                                            { header: "أيام منذ آخر بيع", key: "daysSince", width: 16 },
                                        ],
                                        "تقرير_الأصناف_الراكدة",
                                        "الراكدة"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    <div className="flex flex-wrap items-center gap-1.5 border-b p-4">
                        {[30, 60, 90, 180].map((d) => (
                            <button
                                key={d}
                                onClick={() => setSlowDays(d)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                    slowDays === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                                }`}
                            >
                                {d} يوم
                            </button>
                        ))}
                    </div>
                    {slowLoading && <LoadingRow />}
                    {slowError && <ErrorRow message={slowError} />}
                    {!slowLoading && !slowError && slowData && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted text-right text-xs text-muted-foreground">
                                        <th className="p-2.5 font-medium">الاسم التجاري</th>
                                        <th className="p-2.5 font-medium">آخر بيع</th>
                                        <th className="p-2.5 font-medium">عدد الأيام</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {slowData.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="p-4 text-center text-muted-foreground">
                                                لا توجد أصناف راكدة حالياً.
                                            </td>
                                        </tr>
                                    )}
                                    {slowData.map((r) => (
                                        <tr key={r.barcode} className="border-t">
                                            <td className="p-2.5">{r.tradeName}</td>
                                            <td className="p-2.5">
                                                {r.lastSoldAt ? (
                                                    new Date(r.lastSoldAt).toLocaleDateString("ar-IQ")
                                                ) : (
                                                    <span className="font-semibold text-destructive">لم يُبَع أبداً</span>
                                                )}
                                            </td>
                                            <td className="tabular-nums p-2.5">{r.daysSince === null ? "—" : fmt(r.daysSince)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {tab === "fulfilment" && (
                <SectionCard title="نسبة التلبية">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                        <p className="text-xs text-muted-foreground">من بنود الطلبات التي بُتَّ فيها (بحسب تاريخ إنشاء الطلب)</p>
                        <RangePicker value={fulfilmentRangeDays} onChange={setFulfilmentRangeDays} />
                    </div>
                    {fulfilmentLoading && <LoadingRow />}
                    {fulfilmentError && <ErrorRow message={fulfilmentError} />}
                    {!fulfilmentLoading && !fulfilmentError && fulfilmentData && (
                        <div className="space-y-5 p-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-lg border bg-background p-4">
                                    <p className="text-xs text-muted-foreground">نسبة التلبية الكاملة</p>
                                    <p className="tabular-nums mt-1 text-2xl font-bold text-primary">{fulfilmentData.ratePercent}%</p>
                                </div>
                                <div className="rounded-lg border bg-background p-4">
                                    <p className="text-xs text-muted-foreground">مكتمل بالكامل</p>
                                    <p className="tabular-nums mt-1 text-2xl font-bold text-success">{fmt(fulfilmentData.fullyFilled)}</p>
                                </div>
                                <div className="rounded-lg border bg-background p-4">
                                    <p className="text-xs text-muted-foreground">تلبية جزئية</p>
                                    <p className="tabular-nums mt-1 text-2xl font-bold text-warning">{fmt(fulfilmentData.partial)}</p>
                                </div>
                                <div className="rounded-lg border bg-background p-4">
                                    <p className="text-xs text-muted-foreground">نافد</p>
                                    <p className="tabular-nums mt-1 text-2xl font-bold text-destructive">{fmt(fulfilmentData.outOfStock)}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {[
                                    { label: "مكتمل بالكامل", value: fulfilmentData.fullyFilled, color: "bg-success" },
                                    { label: "تلبية جزئية", value: fulfilmentData.partial, color: "bg-warning" },
                                    { label: "نافد", value: fulfilmentData.outOfStock, color: "bg-destructive" },
                                ].map((row) => {
                                    const pct =
                                        fulfilmentData.totalLines === 0 ? 0 : Math.round((row.value / fulfilmentData.totalLines) * 100);
                                    return (
                                        <div key={row.label} className="flex items-center gap-3">
                                            <span className="w-28 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                                            <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                                                <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="tabular-nums w-24 shrink-0 text-xs text-foreground">
                                                {fmt(row.value)} ({pct}%)
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-muted-foreground">إجمالي البنود المقاسة: {fmt(fulfilmentData.totalLines)}</p>
                        </div>
                    )}
                </SectionCard>
            )}

            {tab === "expiry-risk" && (
                <SectionCard
                    title="مخاطر الصلاحية"
                    action={
                        expiryData && expiryData.items.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        expiryData.items.map((it) => ({ ...it, expiryDate: new Date(it.expiryDate) })),
                                        [
                                            { header: "الاسم التجاري", key: "tradeName", width: 26 },
                                            { header: "رقم الدفعة", key: "batchNumber", width: 16 },
                                            { header: "تاريخ الانتهاء", key: "expiryDate", width: 16 },
                                            { header: "الكمية", key: "quantity", width: 12 },
                                            { header: "القيمة", key: "value", width: 14 },
                                            { header: "الفئة", key: "bucket", width: 12 },
                                        ],
                                        "تقرير_مخاطر_الصلاحية",
                                        "مخاطر الصلاحية"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    {expiryLoading && <LoadingRow />}
                    {expiryError && <ErrorRow message={expiryError} />}
                    {!expiryLoading && !expiryError && expiryData && (
                        <>
                            <ExpiryBucketBars byBucket={expiryData.byBucket} />
                            <div className="overflow-x-auto border-t">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted text-right text-xs text-muted-foreground">
                                            <th className="p-2.5 font-medium">الاسم التجاري</th>
                                            <th className="p-2.5 font-medium">رقم الدفعة</th>
                                            <th className="p-2.5 font-medium">تاريخ الانتهاء</th>
                                            <th className="p-2.5 font-medium">الكمية</th>
                                            <th className="p-2.5 font-medium">القيمة</th>
                                            <th className="p-2.5 font-medium">الفئة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {expiryData.items.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                                    لا توجد دفعات حالياً.
                                                </td>
                                            </tr>
                                        )}
                                        {expiryData.items
                                            .slice()
                                            .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                                            .map((it, i) => {
                                                const meta = EXPIRY_BUCKET_META.find((m) => m.key === it.bucket)!;
                                                return (
                                                    <tr key={i} className="border-t">
                                                        <td className="p-2.5">{it.tradeName}</td>
                                                        <td className="p-2.5">{it.batchNumber}</td>
                                                        <td className="p-2.5">{new Date(it.expiryDate).toLocaleDateString("ar-IQ")}</td>
                                                        <td className="tabular-nums p-2.5">{fmt(it.quantity)}</td>
                                                        <td className="tabular-nums p-2.5">{fmt(it.value)}</td>
                                                        <td className="p-2.5">
                                                            <StatusChip variant={meta.variant} label={meta.label} />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </SectionCard>
            )}

            {tab === "margins" && canViewFinance && (
                <SectionCard
                    title="هامش الربح لكل صنف"
                    action={
                        marginData && marginData.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        marginData.map((r) => ({ ...r, marginPercent: r.marginPercent === null ? "غير معروف" : r.marginPercent })),
                                        [
                                            { header: "الاسم التجاري", key: "tradeName", width: 26 },
                                            { header: "الباركود", key: "barcode", width: 18 },
                                            { header: "الإيراد", key: "revenue", width: 14 },
                                            { header: "التكلفة", key: "cost", width: 14 },
                                            { header: "الربح", key: "margin", width: 14 },
                                            { header: "نسبة الهامش %", key: "marginPercent", width: 14 },
                                        ],
                                        "تقرير_الهوامش",
                                        "الهوامش"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                        <p className="text-xs text-muted-foreground">التكلفة الحالية المسجَّلة في الكتالوج — تقريبية لأي صنف تغيّرت تكلفته لاحقاً.</p>
                        <RangePicker value={marginRangeDays} onChange={setMarginRangeDays} />
                    </div>
                    {marginLoading && <LoadingRow />}
                    {marginError && <ErrorRow message={marginError} />}
                    {!marginLoading && !marginError && marginData && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted text-right text-xs text-muted-foreground">
                                        <th className="p-2.5 font-medium">الاسم التجاري</th>
                                        <th className="p-2.5 font-medium">الإيراد</th>
                                        <th className="p-2.5 font-medium">التكلفة</th>
                                        <th className="p-2.5 font-medium">الربح</th>
                                        <th className="p-2.5 font-medium">نسبة الهامش</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {marginData.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                                لا توجد مبيعات ضمن هذه الفترة.
                                            </td>
                                        </tr>
                                    )}
                                    {marginData
                                        .slice()
                                        .sort((a, b) => b.margin - a.margin)
                                        .map((r) => (
                                            <tr key={r.barcode} className="border-t">
                                                <td className="p-2.5">{r.tradeName}</td>
                                                <td className="tabular-nums p-2.5">{fmt(r.revenue)}</td>
                                                <td className="tabular-nums p-2.5">{fmt(r.cost)}</td>
                                                <td className="tabular-nums p-2.5">{fmt(r.margin)}</td>
                                                <td className="tabular-nums p-2.5">
                                                    {r.marginPercent === null ? (
                                                        <span className="text-muted-foreground">غير معروف (لا تكلفة مسجَّلة)</span>
                                                    ) : (
                                                        `${r.marginPercent}%`
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {tab === "customers" && canViewCustomers && (
                <SectionCard
                    title="مبيعات كل صيدلية"
                    action={
                        customerData && customerData.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        customerData.map((r) => ({ ...r, lastOrderAt: new Date(r.lastOrderAt) })),
                                        [
                                            { header: "الصيدلية", key: "pharmacyName", width: 26 },
                                            { header: "الإجمالي", key: "total", width: 14 },
                                            { header: "عدد الطلبات", key: "orders", width: 14 },
                                            { header: "آخر طلب", key: "lastOrderAt", width: 16 },
                                        ],
                                        "تقرير_مبيعات_العملاء",
                                        "العملاء"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    <div className="flex flex-wrap items-center justify-end gap-3 border-b p-4">
                        <RangePicker value={customerRangeDays} onChange={setCustomerRangeDays} />
                    </div>
                    {customerLoading && <LoadingRow />}
                    {customerError && <ErrorRow message={customerError} />}
                    {!customerLoading && !customerError && customerData && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted text-right text-xs text-muted-foreground">
                                        <th className="p-2.5 font-medium">الصيدلية</th>
                                        <th className="p-2.5 font-medium">الإجمالي (د.ع)</th>
                                        <th className="p-2.5 font-medium">عدد الطلبات</th>
                                        <th className="p-2.5 font-medium">آخر طلب</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerData.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                لا توجد مبيعات ضمن هذه الفترة.
                                            </td>
                                        </tr>
                                    )}
                                    {customerData.map((r) => (
                                        <tr key={r.organizationId} className="border-t">
                                            <td className="p-2.5">{r.pharmacyName}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.total)}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.orders)}</td>
                                            <td className="p-2.5">{new Date(r.lastOrderAt).toLocaleDateString("ar-IQ")}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {tab === "payables" && canViewPayables && (
                <SectionCard
                    title="الذمم الدائنة — ما يدين به مذخرك للموردين"
                    action={
                        payablesSuppliers && payablesSuppliers.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        payablesSuppliers,
                                        [
                                            { header: "المورّد", key: "supplierName", width: 26 },
                                            { header: "المتبقي القائم", key: "outstanding", width: 16 },
                                            { header: "منه متأخر", key: "overdue", width: 16 },
                                        ],
                                        "تقرير_الذمم_الدائنة",
                                        "الموردون"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    {payablesLoading && <LoadingRow />}
                    {payablesError && <ErrorRow message={payablesError} />}
                    {!payablesLoading && !payablesError && payablesSummary && (
                        <div className="space-y-4 p-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border bg-muted/40 p-4">
                                    <div className="text-xs text-muted-foreground">إجمالي الذمم الدائنة القائمة</div>
                                    <div className="tabular-nums mt-1 text-xl font-bold">{fmt(payablesSummary.outstanding)}</div>
                                </div>
                                <div className="rounded-lg border bg-muted/40 p-4">
                                    <div className="text-xs text-muted-foreground">المتأخر منها (تجاوز الاستحقاق)</div>
                                    <div className="tabular-nums mt-1 text-xl font-bold text-destructive">{fmt(payablesSummary.overdue)}</div>
                                </div>
                            </div>

                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted text-right text-xs text-muted-foreground">
                                            <th className="p-2.5 font-medium">المورّد</th>
                                            <th className="p-2.5 font-medium">المتبقي القائم (د.ع)</th>
                                            <th className="p-2.5 font-medium">منه متأخر (د.ع)</th>
                                            <th className="p-2.5 font-medium">أسوأ تقادم</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(!payablesSuppliers || payablesSuppliers.length === 0) && (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                    لا توجد ذمم دائنة قائمة حالياً.
                                                </td>
                                            </tr>
                                        )}
                                        {payablesSuppliers?.map((s) => (
                                            <tr key={s.supplierId} className="border-t">
                                                <td className="p-2.5 font-medium">{s.supplierName}</td>
                                                <td className="tabular-nums p-2.5">{fmt(s.outstanding)}</td>
                                                <td className="tabular-nums p-2.5 text-destructive">{fmt(s.overdue)}</td>
                                                <td className="p-2.5">
                                                    <StatusChip
                                                        variant={
                                                            s.bucket === "CURRENT"
                                                                ? "success"
                                                                : s.bucket === "D30" || s.bucket === "D60"
                                                                  ? "warning"
                                                                  : "danger"
                                                        }
                                                        label={
                                                            s.bucket === "CURRENT"
                                                                ? "ضمن المهلة"
                                                                : s.bucket === "D30"
                                                                  ? "متأخر 1-30 يوم"
                                                                  : s.bucket === "D60"
                                                                    ? "متأخر 31-60 يوم"
                                                                    : s.bucket === "D90"
                                                                      ? "متأخر 61-90 يوم"
                                                                      : "متأخر +90 يوم"
                                                        }
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </SectionCard>
            )}

            {tab === "reps" && canViewReps && (
                <SectionCard
                    title="أداء المندوبين — مبيعات، ربح، تحصيل، وعمولة الفترة"
                    action={
                        repsData && repsData.length > 0 ? (
                            <ExportButton
                                onClick={() =>
                                    exportToExcel(
                                        repsData.map((r) => ({
                                            name: r.name,
                                            salesTotal: r.salesTotal,
                                            profitTotal: r.profitTotal,
                                            collectedTotal: r.collectedTotal,
                                            commissionBasis: COMMISSION_BASIS_LABEL[r.commissionBasis],
                                            commissionAmount: r.commission.amount,
                                        })),
                                        [
                                            { header: "المندوب", key: "name", width: 22 },
                                            { header: "المبيعات", key: "salesTotal", width: 14 },
                                            { header: "الربح", key: "profitTotal", width: 14 },
                                            { header: "المُحصَّل", key: "collectedTotal", width: 14 },
                                            { header: "نمط العمولة", key: "commissionBasis", width: 16 },
                                            { header: "العمولة", key: "commissionAmount", width: 14 },
                                        ],
                                        "تقرير_المندوبين",
                                        "المندوبون"
                                    )
                                }
                            />
                        ) : undefined
                    }
                >
                    <div className="flex flex-wrap items-center justify-end gap-3 border-b p-4">
                        <RangePicker value={repsRangeDays} onChange={setRepsRangeDays} />
                    </div>
                    {repsLoading && <LoadingRow />}
                    {repsError && <ErrorRow message={repsError} />}
                    {!repsLoading && !repsError && repsData && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted text-right text-xs text-muted-foreground">
                                        <th className="p-2.5 font-medium">المندوب</th>
                                        <th className="p-2.5 font-medium">المبيعات (د.ع)</th>
                                        <th className="p-2.5 font-medium">الربح (د.ع)</th>
                                        <th className="p-2.5 font-medium">المُحصَّل (د.ع)</th>
                                        <th className="p-2.5 font-medium">نمط العمولة</th>
                                        <th className="p-2.5 font-medium">أساس العمولة</th>
                                        <th className="p-2.5 font-medium">العمولة المستحقة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {repsData.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-4 text-center text-muted-foreground">
                                                لا يوجد مندوبون بعد.
                                            </td>
                                        </tr>
                                    )}
                                    {repsData.map((r) => (
                                        <tr key={r.repId} className="border-t">
                                            <td className="p-2.5 font-medium">{r.name}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.salesTotal)}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.profitTotal)}</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.collectedTotal)}</td>
                                            <td className="p-2.5">{COMMISSION_BASIS_LABEL[r.commissionBasis]} ({r.commissionRate}%)</td>
                                            <td className="tabular-nums p-2.5">{fmt(r.commission.base)}</td>
                                            <td className="tabular-nums p-2.5 font-medium text-primary">{fmt(r.commission.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}
        </div>
    );
}
