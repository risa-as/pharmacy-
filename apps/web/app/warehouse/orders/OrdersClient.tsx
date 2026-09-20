"use client";

// المرحلة 3 من ميزة المذاخر: عميل صندوق الطلبات — قائمة بفلترة الحالة +
// شاشة التسعير/المراجعة (لكل صنف: متوفر/جزئي/نافد + السعر النهائي) + إرسال العرض.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Printer, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import StatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import Modal from "@/app/warehouse/_components/Modal";
import { computeBonusUnits } from "@/app/lib/warehouse-bonus";
// إصلاح صدق الواجهة (2026-09): زر العرض يجب أن يتنبأ بنفس قاعدة الاعتماد
// الآلي التي يستعملها الخادم فعلياً — لا نسخة يدوية موازية منها هنا، وإلا
// انفرط الاثنان مجدداً أول مرة تتغيّر القاعدة في هذا الملف وحده.
import { buildQuoteDecision, shouldAutoApprove, type QuoteItemInput } from "@/app/lib/warehouse-quote";
// مرجع الشحنة المولَّد آلياً (قرار صاحب النظام 2026-09): «رقم الدفعة» لم يعد
// حقلاً يكتبه المذخر — نفس دالة الخادم بالضبط تُستدعى هنا فقط للعرض المسبق
// قبل الحفظ (انظر تعليق computeShipmentRefs في shipment-ref.ts)، فيرى المذخر
// ما سيُصدره النظام دون إرسال القيمة في الطلب أصلاً.
import { computeShipmentRefs } from "@/app/lib/shipment-ref";

type OrderStatus =
    | "DRAFT" | "SENT" | "UNDER_REVIEW" | "QUOTED" | "APPROVED"
    | "REJECTED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/** المرحلة 4 (بدائل الدواء): مرشَّحة فعلاً عبر rankAlternatives في الـ API —
 * كل عنصر هنا مضمون أنه مدرَج ومتوفر لدى هذا المذخر بالضبط، بلا حاجة لأي
 * فلترة إضافية في الواجهة. انظر app/lib/warehouse-alternatives.ts. */
interface AlternativeOption {
    barcode: string;
    tradeName: string;
    price: number;
    sellableQuantity: number;
}

interface OrderItem {
    id: string;
    quantity: number;
    unitPrice: number;
    requestedPrice: number | null;
    quotedPrice: number | null;
    quotedQuantity: number | null;
    status: string;
    note: string | null;
    // ميزة نقل الدفعة/الانتهاء عند التسعير: القيم المخزَّنة فعلياً من آخر
    // تسعير (إن وُجدت) — items هنا يصل عبر include بلا select متداخل في كل
    // مسارات الجلب الثلاثة (page.tsx وGET/POST .../orders)، فكل الحقول
    // العددية لـWarehouseOrderItem تصل تلقائياً بما فيها هذان الحقلان رغم عدم
    // ذكرهما صراحة هناك. expiryDate وحده يُستخدَم فعلياً لتهيئة rows أدناه
    // عند إعادة فتح طلب مُسعَّر مسبقاً (انظر تعليق useState الأول في
    // ReviewModal). batchNumber يبقى في هذا النوع لأنه يصل من الخادم كما هو
    // (نفس منطق include أعلاه) لكن الواجهة لا تعرضه ولا تقرأه بعد الآن —
    // القيمة المعروضة الآن مُشتقّة دوماً عبر shipmentRefs/computeShipmentRefs
    // (قرار صاحب النظام 2026-09: رقم الدفعة يُصدره النظام لا المذخر).
    batchNumber: string | null;
    expiryDate: string | null;
    drug: { tradeName: string; barcode: string };
    // ميزة البونص: bonusQuantity هو المعتمد فعلياً على السطر (يأتي من القاعدة
    // مباشرة، افتراضه 0)؛ catalogBonus* مُقترَحان فقط من page.tsx/[id]/route.ts
    // (قاعدة الكتالوج القياسية) لتعبئة الحقل أول مرة — انظر ReviewModal أدناه.
    bonusQuantity: number;
    catalogBonusThreshold?: number;
    catalogBonusQuantity?: number;
    // المرحلة 4 (بدائل الدواء): بدائل هذا الصنف المتوفرة فعلاً لدى هذا المذخر —
    // تُحسَب دوماً من الـ API بصرف النظر عن حالة الصنف الحالية (انظر تعليق
    // GET .../orders/[id]/route.ts)؛ الواجهة تعرضها فقط حين يختار المذخر محلياً
    // "نافد" لهذا الصنف. قد تكون [] دوماً اليوم لأن GlobalDrug.alternatives فارغ
    // في قاعدة الإنتاج بالكامل — انظر تعليق الملف في warehouse-alternatives.ts.
    alternatives?: AlternativeOption[];
}

interface OrderEvent {
    id: string;
    actorType: string;
    actorName: string | null;
    type: string;
    createdAt: string;
}

interface Order {
    id: string;
    orderNumber: string | null;
    status: OrderStatus;
    totalAmount: number;
    notes: string | null;
    createdAt: string;
    // اسم الفرع وحده لا يميّز الصيدلية: كل المؤسسات الست في الإنتاج تسمّي
    // فرعها الافتراضي «الفرع الرئيسي»، فاسم المؤسسة (organization) هو الجزء
    // المميِّز فعلياً — يُعامَل بحذر (اختياري) كما في أوراق الطباعة المرجعية.
    branch: { name: string; organization?: { name: string } | null };
    items: OrderItem[];
    events: OrderEvent[];
}

const STATUS_LABEL: Record<OrderStatus, string> = {
    DRAFT: "مسودة",
    SENT: "طلب جديد",
    UNDER_REVIEW: "قيد المراجعة",
    QUOTED: "بانتظار قرار الصيدلية",
    APPROVED: "معتمد — جهّز الشحن",
    REJECTED: "مرفوض",
    SHIPPED: "قيد التسليم",
    DELIVERED: "مُسلَّم",
    CANCELLED: "ملغى",
};

// دلالات موحّدة عبر StatusChip المشترك — منفصلة عمداً عن primary (السند
// اللوني السابق لـ SENT كان bg-primary/10 نفسه، وهو ما يحظره تصميم هذه
// المرحلة صراحة: الدلالة يجب أن تكون مميَّزة عن لون العلامة).
const STATUS_VARIANT: Record<OrderStatus, StatusChipVariant> = {
    DRAFT: "neutral",
    SENT: "info",
    UNDER_REVIEW: "warning",
    QUOTED: "info",
    APPROVED: "success",
    REJECTED: "danger",
    SHIPPED: "info",
    DELIVERED: "success",
    CANCELLED: "neutral",
};

type ItemDecision = "AVAILABLE" | "PARTIAL" | "OUT_OF_STOCK";

/** صفّ صنف في نافذة الطلب الهاتفي. */
interface PhoneLine {
    catalogItemId: string;
    tradeName: string;
    barcode: string;
    quantity: string;
    unitPrice: string;
    bonusQuantity: string;
}

interface CatalogOption {
    id: string;
    barcode: string;
    price: number;
    isAvailable: boolean;
    drug: { tradeName: string };
}

export default function OrdersClient({
    initialOrders,
    canShipOrders,
    canQuoteOrders,
}: {
    initialOrders: Order[];
    canShipOrders: boolean;
    canQuoteOrders: boolean;
}) {
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [reviewOrder, setReviewOrder] = useState<Order | null>(null);

    // router.refresh() يعيد بيانات الخادم إلى initialOrders، لكن useState لا
    // ينسخ props الجديدة وحده؛ هذا الربط هو الذي يجعل التحديث الدوري مرئياً.
    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    const visible = useMemo(
        () => (statusFilter === "ALL" ? orders : orders.filter((o) => o.status === statusFilter)),
        [orders, statusFilter]
    );

    // لا توجد قناة WebSocket في النظام. لذلك نحدّث صندوق الوارد كل دقيقة عند
    // ظهور الصفحة فقط، لكن نتوقف أثناء تسعير طلب مفتوح حتى لا تُفقد إدخالات
    // المستخدم غير المحفوظة بسبب router.refresh().
    useEffect(() => {
        if (reviewOrder) return;

        const refreshIfVisible = () => {
            if (document.visibilityState === "visible") router.refresh();
        };
        const timer = window.setInterval(refreshIfVisible, 60_000);
        return () => window.clearInterval(timer);
    }, [reviewOrder, router]);

    const startReview = async (order: Order) => {
        const res = await fetch("/api/warehouse-portal/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id }),
        });
        const data = await res.json();
        if (!res.ok) {
            toast.error(data.error ?? "تعذر بدء المراجعة");
            return;
        }
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "UNDER_REVIEW" } : o)));
        setReviewOrder({ ...order, status: "UNDER_REVIEW" });
    };

    const updateShipping = async (order: Order, status: "SHIPPED" | "DELIVERED") => {
        const res = await fetch(`/api/warehouse-portal/orders/${order.id}/shipping`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) {
            toast.error(data.error ?? "تعذر تحديث حالة الشحن");
            return;
        }
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
        toast.success(status === "SHIPPED" ? "تم تسجيل شحن الطلب" : "تم تسجيل تسليم الطلب");
    };

    // ── طلب هاتفي: يدخله المذخر نيابةً عن صيدلية طلبت بالهاتف/واتساب ──────
    // الطلب يُنشأ QUOTED لا APPROVED: اعتماد الصيدلية هو الموضع الذي يجري فيه
    // فحص حدّ الائتمان وتُنشأ الفاتورة، فلا أثر مالي من هنا. انظر تعليق
    // app/api/warehouse-portal/orders/phone/route.ts.
    const [phoneOpen, setPhoneOpen] = useState(false);
    const [customers, setCustomers] = useState<Array<{ organizationId: string; name: string }>>([]);
    const [orgId, setOrgId] = useState("");
    const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
    const [branchId, setBranchId] = useState("");
    const [catalog, setCatalog] = useState<CatalogOption[]>([]);
    const [catalogSearch, setCatalogSearch] = useState("");
    const [phoneLines, setPhoneLines] = useState<PhoneLine[]>([]);
    const [phoneNotes, setPhoneNotes] = useState("");
    const [phoneSaving, setPhoneSaving] = useState(false);

    // العملاء والكتالوج يُجلبان عند أول فتح فقط — لا داعي لتحميلهما مع الصفحة.
    useEffect(() => {
        if (!phoneOpen || customers.length > 0) return;
        void (async () => {
            try {
                const [cRes, kRes] = await Promise.all([
                    fetch("/api/warehouse-portal/customers"),
                    fetch("/api/warehouse-portal/catalog"),
                ]);
                const cData = await cRes.json().catch(() => ({}));
                const kData = await kRes.json().catch(() => ({}));
                if (cRes.ok) setCustomers(cData.customers ?? []);
                if (kRes.ok) setCatalog(kData.items ?? []);
            } catch {
                toast.error("تعذر جلب العملاء أو الكتالوج");
            }
        })();
    }, [phoneOpen, customers.length]);

    // تغيير العميل يمسح الفرع والأصناف: أسعار الأصناف قد تختلف بطبقة سعر
    // العميل، وترك سطور عميل سابق يُنشئ طلباً بأسعار لا تخصّه.
    const chooseOrg = async (nextOrgId: string) => {
        setOrgId(nextOrgId);
        setBranchId("");
        setBranches([]);
        setPhoneLines([]);
        if (!nextOrgId) return;
        try {
            const res = await fetch(`/api/warehouse-portal/customers/${nextOrgId}/branches`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر جلب فروع الصيدلية");
                return;
            }
            setBranches(data.branches ?? []);
            if ((data.branches ?? []).length === 1) setBranchId(data.branches[0].id);
            if (data.isBlocked) toast.error("تعامل هذه الصيدلية موقوف — استأنفه من صفحة العملاء.");
        } catch {
            toast.error("تعذر الاتصال بالسيرفر");
        }
    };

    const addPhoneLine = (item: CatalogOption) => {
        if (phoneLines.some((l) => l.catalogItemId === item.id)) {
            toast.info("الصنف مضاف بالفعل — عدّل كميته في السطر.");
            return;
        }
        setPhoneLines((prev) => [
            ...prev,
            {
                catalogItemId: item.id,
                tradeName: item.drug.tradeName,
                barcode: item.barcode,
                quantity: "1",
                unitPrice: String(item.price),
                bonusQuantity: "0",
            },
        ]);
        setCatalogSearch("");
    };

    const phoneTotal = phoneLines.reduce(
        (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
        0
    );

    const submitPhoneOrder = async () => {
        if (!branchId) {
            toast.error("اختر فرع الاستلام");
            return;
        }
        if (phoneLines.length === 0) {
            toast.error("أضف صنفاً واحداً على الأقل");
            return;
        }
        setPhoneSaving(true);
        try {
            const res = await fetch("/api/warehouse-portal/orders/phone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    branchId,
                    notes: phoneNotes.trim() || undefined,
                    items: phoneLines.map((l) => ({
                        catalogItemId: l.catalogItemId,
                        quantity: Number(l.quantity),
                        unitPrice: Number(l.unitPrice),
                        bonusQuantity: Number(l.bonusQuantity) || 0,
                    })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر إنشاء الطلب");
                return;
            }
            toast.success("أُنشئ الطلب وأُشعرت الصيدلية — بانتظار اعتمادها للعرض.");
            setPhoneOpen(false);
            setOrgId("");
            setBranchId("");
            setBranches([]);
            setPhoneLines([]);
            setPhoneNotes("");
            router.refresh();
        } catch {
            toast.error("تعذر الاتصال بالسيرفر");
        } finally {
            setPhoneSaving(false);
        }
    };

    const refreshOne = async (orderId: string) => {
        const res = await fetch(`/api/warehouse-portal/orders/${orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.order) {
            setOrders((prev) =>
                prev.map((o) => (o.id === orderId ? JSON.parse(JSON.stringify(data.order)) : o))
            );
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="الطلبات الواردة"
                description="طلبات الصيدليات من أدويتك — راجع الأصناف والأسعار ثم أرسل العرض."
                actions={
                    <div className="flex flex-wrap items-center gap-1">
                        {canQuoteOrders && (
                            <button
                                onClick={() => setPhoneOpen(true)}
                                className="mr-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                            >
                                <Phone className="h-3.5 w-3.5" /> طلب هاتفي
                            </button>
                        )}
                        {[
                            ["ALL", "الكل"],
                            ["SENT", "جديدة"],
                            ["UNDER_REVIEW", "قيد المراجعة"],
                            ["QUOTED", "بانتظار الصيدلية"],
                            ["APPROVED", "معتمدة"],
                            ["SHIPPED", "قيد التسليم"],
                            ["DELIVERED", "مُسلَّمة"],
                        ].map(([v, l]) => (
                            <button
                                key={v}
                                onClick={() => setStatusFilter(v)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                    statusFilter === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                                }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                }
            />

            {visible.length === 0 ? (
                <EmptyState icon="📭" title="لا توجد طلبات بهذه الحالة بعد." />
            ) : (
                <div className="space-y-3">
                    {visible.map((o) => (
                        <div key={o.id} className="rounded-lg border bg-card p-4 shadow-sm">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-mono text-sm font-bold">{o.orderNumber ?? o.id.slice(0, 8)}</span>
                                {/* اسم المؤسسة (الصيدلية) هو الجزء المميِّز، لا الفرع: كل
                                    الصيدليات الست في الإنتاج تسمّي فرعها الافتراضي «الفرع
                                    الرئيسي» بالحرف — فعرض الفرع وحده كان يجعل كل الطلبات
                                    تبدو من نفس العميل. المؤسسة بلون النص الافتراضي (كما
                                    رقم الطلب) والفرع ثانوي مكتوم بجانبها بين قوسين. */}
                                <span className="text-sm font-medium text-foreground">
                                    من: {o.branch.organization?.name ?? "—"}
                                    <span className="mr-1 text-xs font-normal text-muted-foreground">
                                        ({o.branch.name})
                                    </span>
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(o.createdAt).toLocaleString("ar-IQ")}
                                </span>
                                <span className="mr-auto">
                                    <StatusChip variant={STATUS_VARIANT[o.status]} label={STATUS_LABEL[o.status]} />
                                </span>
                            </div>
                            <div className="tabular-nums mt-2 text-sm text-muted-foreground">
                                {o.items.length} صنف — الإجمالي الحالي: {o.totalAmount.toLocaleString("ar-IQ")} د.ع
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {(o.status === "SENT") && (
                                    <button
                                        onClick={() => startReview(o)}
                                        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                                    >
                                        بدء المراجعة
                                    </button>
                                )}
                                {(o.status === "UNDER_REVIEW" || o.status === "QUOTED" || o.status === "APPROVED") && (
                                    <button
                                        onClick={() => setReviewOrder(o)}
                                        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
                                    >
                                        {o.status === "UNDER_REVIEW" ? "متابعة المراجعة والتسعير" : "عرض التفاصيل"}
                                    </button>
                                )}
                                {o.status === "APPROVED" && (
                                    <button
                                        onClick={() => updateShipping(o, "SHIPPED")}
                                        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                                    >
                                        تم الشحن
                                    </button>
                                )}
                                {o.status === "SHIPPED" && (
                                    <button
                                        onClick={() => updateShipping(o, "DELIVERED")}
                                        className="rounded-lg bg-success px-3 py-1.5 text-sm text-success-foreground hover:bg-success/90"
                                    >
                                        تم التسليم
                                    </button>
                                )}
                                {/* فاتورة الشحن: الورقة الواحدة التي تسافر مع البضاعة
                                    (أسعار + إجماليات + إرشاد FEFO + رصيد العميل معاً)
                                    — مفيدة من لحظة الاعتماد (البضاعة تُجمع) حتى
                                    التسليم. الصفحة نفسها محروسة بـcanShipOrders،
                                    والرابط يُخفى لمن لا يملكها. */}
                                {canShipOrders &&
                                    (o.status === "APPROVED" || o.status === "SHIPPED") && (
                                    <Link
                                        href={`/warehouse/print/picking/${o.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <Printer className="h-3.5 w-3.5" /> فاتورة الشحن
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                open={phoneOpen}
                onClose={() => setPhoneOpen(false)}
                title="طلب هاتفي نيابةً عن صيدلية"
                maxWidthClass="max-w-3xl"
            >
                <div className="space-y-4">
                    <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        يُنشأ الطلب مسعَّراً وبانتظار <b>اعتماد الصيدلية</b> من شاشتها — لا تُسجَّل أي
                        فاتورة ولا ذمّة قبل اعتمادها. تُشعَر الصيدلية تلقائياً.
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">الصيدلية</label>
                            <select
                                value={orgId}
                                onChange={(e) => void chooseOrg(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                            >
                                <option value="">— اختر عميلاً —</option>
                                {customers.map((c) => (
                                    <option key={c.organizationId} value={c.organizationId}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">فرع الاستلام</label>
                            <select
                                value={branchId}
                                onChange={(e) => setBranchId(e.target.value)}
                                disabled={branches.length === 0}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                            >
                                <option value="">— اختر الفرع —</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {orgId && (
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">أضف صنفاً من كتالوجك</label>
                            <input
                                value={catalogSearch}
                                onChange={(e) => setCatalogSearch(e.target.value)}
                                placeholder="ابحث بالاسم أو الباركود…"
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                            />
                            {catalogSearch.trim().length > 1 && (
                                <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
                                    {catalog
                                        .filter(
                                            (it) =>
                                                it.drug.tradeName.toLowerCase().includes(catalogSearch.trim().toLowerCase()) ||
                                                it.barcode.includes(catalogSearch.trim())
                                        )
                                        .slice(0, 25)
                                        .map((it) => (
                                            <li key={it.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => addPhoneLine(it)}
                                                    disabled={!it.isAvailable}
                                                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-right text-xs hover:bg-muted disabled:opacity-40"
                                                >
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {it.drug.tradeName}
                                                        <span className="mr-2 font-mono text-[10px] text-muted-foreground" dir="ltr">{it.barcode}</span>
                                                    </span>
                                                    <span className="tabular-nums shrink-0">{it.price.toLocaleString("en-US")}</span>
                                                    {!it.isAvailable && <span className="shrink-0 text-[10px]">موقوف</span>}
                                                </button>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {phoneLines.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-right text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">الصنف</th>
                                        <th className="px-3 py-2 font-medium">الكمية</th>
                                        <th className="px-3 py-2 font-medium">السعر</th>
                                        <th className="px-3 py-2 font-medium">بونص</th>
                                        <th className="px-3 py-2 font-medium">الإجمالي</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {phoneLines.map((l, i) => (
                                        <tr key={l.catalogItemId} className="border-t">
                                            <td className="px-3 py-2">
                                                <div className="font-medium">{l.tradeName}</div>
                                                <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">{l.barcode}</div>
                                            </td>
                                            {([
                                                ["quantity", "1", "1"],
                                                ["unitPrice", "any", "0"],
                                                ["bonusQuantity", "1", "0"],
                                            ] as const).map(([field, step, min]) => (
                                                <td key={field} className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        min={min}
                                                        step={step}
                                                        value={l[field]}
                                                        onChange={(e) =>
                                                            setPhoneLines((prev) =>
                                                                prev.map((x, xi) =>
                                                                    xi === i ? { ...x, [field]: e.target.value } : x
                                                                )
                                                            )
                                                        }
                                                        className="tabular-nums w-20 rounded border border-border bg-background px-2 py-1"
                                                    />
                                                </td>
                                            ))}
                                            <td className="tabular-nums px-3 py-2 font-medium">
                                                {((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)).toLocaleString("en-US")}
                                            </td>
                                            <td className="px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setPhoneLines((prev) => prev.filter((_, xi) => xi !== i))}
                                                    className="text-destructive hover:underline"
                                                >
                                                    حذف
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">ملاحظات (اختياري)</label>
                        <textarea
                            value={phoneNotes}
                            onChange={(e) => setPhoneNotes(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                        <p className="text-sm">
                            <span className="text-muted-foreground">إجمالي العرض: </span>
                            <b className="tabular-nums">{phoneTotal.toLocaleString("en-US")} د.ع</b>
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPhoneOpen(false)}
                                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={submitPhoneOrder}
                                disabled={phoneSaving || !branchId || phoneLines.length === 0}
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {phoneSaving ? "جارٍ الإنشاء…" : "إنشاء الطلب وإشعار الصيدلية"}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {reviewOrder && (
                <ReviewModal
                    order={reviewOrder}
                    onClose={() => setReviewOrder(null)}
                    onQuoted={async (orderId, newTotal, autoApproved, predictedAutoApprove, autoApproveReason) => {
                        setReviewOrder(null);
                        await refreshOne(orderId);
                        void newTotal;
                        // الاعتماد الآلي (قرار صاحب النظام 2026-09): حين يطابق العرض
                        // طلب الصيدلية تماماً يُعتمَد الطلب فوراً بلا انتظار ضغطة
                        // الصيدلية — رسالة "أُرسل العرض للصيدلية" كانت لتصبح كاذبة
                        // هنا (الصيدلية لم يعد عليها فعل شيء، والطلب معتمد فعلاً).
                        if (autoApproved) {
                            toast.success(
                                "طابق العرض الطلب تماماً — اعتُمد تلقائياً. جهّز الشحن الآن."
                            );
                        } else if (predictedAutoApprove) {
                            // الواجهة توقّعت اعتماداً آلياً (بنفس shouldAutoApprove التي
                            // استعملها الخادم) لكن الخادم — المرجع الوحيد الموثوق —
                            // رفضه لسبب لا تراه الواجهة (حدّ ائتمان، تغيّر متزامن...).
                            // ترك الرسالة العامة هنا كان يخفي هذا التناقض عن المذخر
                            // بعد أن وعدته الشارة/التلميح قبل الإرسال بالاعتماد الآلي.
                            toast.info(
                                autoApproveReason
                                    ? `أُرسل العرض، لكن لم يُعتمد آلياً: ${autoApproveReason}`
                                    : "أُرسل العرض — لم يُعتمد آلياً، بانتظار اعتماد الصيدلية يدوياً."
                            );
                        } else {
                            toast.success("أُرسل العرض للصيدلية");
                        }
                    }}
                />
            )}
        </div>
    );
}

function ReviewModal({
    order,
    onClose,
    onQuoted,
}: {
    order: Order;
    onClose: () => void;
    // autoApproved: ميزة الاعتماد الآلي (قرار صاحب النظام 2026-09) — يحملها
    // /api/warehouse-portal/orders/[id]/quote في استجابته حين يطابق العرض
    // طلب الصيدلية تماماً فيُعتمَد الطلب فوراً بلا انتظار الصيدلية.
    // predictedAutoApprove/autoApproveReason: إصلاح صدق الواجهة (2026-09) —
    // ما توقّعته هذه الشاشة قبل الإرسال (نفس shouldAutoApprove) وسبب الخادم
    // الفعلي إن اختلفت النتيجة، ليعرف الطالب سبب التناقض بدل رسالة عامة صامتة.
    onQuoted: (
        orderId: string,
        total: number,
        autoApproved: boolean,
        predictedAutoApprove: boolean,
        autoApproveReason?: string | null
    ) => void;
}) {
    const canQuote = order.status === "UNDER_REVIEW" || order.status === "SENT";
    const [rows, setRows] = useState(() =>
        order.items.map((it) => {
            // ميزة البونص: بونص مخزَّن فعلاً على السطر (مراجعة سابقة) له الأولوية؛
            // وإلا يُقترَح من قاعدة الكتالوج القياسية (إن وُجدت) على الكمية
            // الأصلية المطلوبة — اقتراح أولي فقط، يعدِّله المذخر بحرّية أدناه.
            const suggestedBonus = computeBonusUnits({
                quantity: it.quantity,
                bonusThreshold: it.catalogBonusThreshold ?? 0,
                bonusQuantity: it.catalogBonusQuantity ?? 0,
            });
            return {
                itemId: it.id,
                decision: (it.status === "OUT_OF_STOCK"
                    ? "OUT_OF_STOCK"
                    : it.status === "PARTIAL"
                    ? "PARTIAL"
                    : "AVAILABLE") as ItemDecision,
                price: it.quotedPrice ?? it.unitPrice,
                partialQty: it.quotedQuantity ?? Math.max(1, Math.floor(it.quantity / 2)),
                note: it.note ?? "",
                bonus: it.bonusQuantity > 0 ? it.bonusQuantity : suggestedBonus,
                // ميزة نقل تاريخ الانتهاء: تُهيَّأ من القيمة المحفوظة فعلياً لا
                // فارغة — إعادة فتح طلب مُسعَّر مسبقاً (زر "عرض التفاصيل"/متابعة
                // المراجعة) يجب أن يُظهر ما أُعلن سابقاً، لا حقلاً فارغاً يوحي بأن
                // التصريح ضاع. يصل من الخادم نصاً ISO (كل تواريخ هذا الملف
                // تُصرَّح string — انظر Order.createdAt)؛ نفس تحويل
                // toISOString().slice(0, 10) المستخدَم في StockClient.tsx وملفات
                // الطباعة لتحويله لقيمة صالحة لـ<input type="date">.
                //
                // batchNumber لم يعد في حالة الصف إطلاقاً (قرار صاحب النظام
                // 2026-09): لم يعد حقلاً يُدخَل أو يُرسَل — انظر shipmentRefs
                // أدناه للقيمة المعروضة (مُشتقّة، لا مُخزَّنة في state).
                expiryDate: it.expiryDate ? new Date(it.expiryDate).toISOString().slice(0, 10) : "",
            };
        })
    );
    const [saving, setSaving] = useState(false);

    // مرجع الشحنة المعروض لكل سطر: يُحسَب مرة واحدة من ترتيب مستقر عبر كل
    // أصناف الطلب (order.items كاملة — لا rows المفلترة ولا الأصناف المتوفرة
    // فقط)، فيتطابق حرفياً مع ما سيكتبه الخادم فعلياً عند الحفظ (نفس الدالة
    // ونفس المدخلات بالضبط — انظر computeShipmentRefs في quote/route.ts).
    const shipmentRefs = useMemo(
        () => computeShipmentRefs(order.orderNumber, order.items.map((it) => it.id)),
        [order.orderNumber, order.items]
    );

    // المرحلة 4 (بدائل الدواء): يُلحق الاقتراح بالملاحظة الحالية (لا يستبدلها —
    // المذخر قد يكون كتب ملاحظة أخرى فعلاً)، ويبقى الحقل قابلاً للتعديل الحر بعدها.
    // لا "علامة" أو بادئة ثابتة تُقرأ لاحقاً آلياً على جانب الصيدلية عمداً: أي
    // تعديل يدوي على النص كان سيكسر عقداً غير موثَّق بصمت — العرض هناك نصّي بحت.
    const applyAlternativeSuggestion = (itemId: string, alt: AlternativeOption) => {
        const suggestion = `بديل متاح: ${alt.tradeName} — ${alt.price.toLocaleString("ar-IQ")} د.ع (المتوفر: ${alt.sellableQuantity.toLocaleString("ar-IQ")})`;
        setRows((prev) =>
            prev.map((r) => {
                if (r.itemId !== itemId) return r;
                const trimmed = r.note.trim();
                return { ...r, note: trimmed ? `${trimmed}\n${suggestion}` : suggestion };
            })
        );
    };

    const total = useMemo(() => {
        return rows.reduce((sum, r) => {
            const item = order.items.find((i) => i.id === r.itemId)!;
            if (r.decision === "OUT_OF_STOCK") return sum;
            const qty = r.decision === "PARTIAL" ? r.partialQty : item.quantity;
            return sum + r.price * qty;
        }, 0);
    }, [rows, order.items]);

    // إصلاح صدق الواجهة (2026-09): معاينة قرار الاعتماد الآلي بنفس الدالتين
    // النقيّتين اللتين يستدعيهما مسار الـ API بعد الحفظ مباشرة — لا نسخة يدوية
    // من الشرط هنا (انظر تعليق الاستيراد أعلاه). المدخلات مبنيّة بنفس شكل
    // body الذي يرسله submit() أدناه بالضبط، وctxList من order.items كما يبنيه
    // الخادم من dbItems (نفس الحقول: itemId/quantity/unitPrice).
    const decisionPreview = useMemo(() => {
        const inputs: QuoteItemInput[] = rows.map((r) => ({
            itemId: r.itemId,
            status: r.decision,
            quotedPrice: r.decision === "OUT_OF_STOCK" ? null : r.price,
            quotedQuantity: r.decision === "PARTIAL" ? r.partialQty : null,
            note: r.note || null,
            bonusQuantity: r.decision === "OUT_OF_STOCK" ? 0 : r.bonus,
        }));
        const ctxList = order.items.map((it) => ({
            itemId: it.id,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
        }));
        return buildQuoteDecision(inputs, ctxList);
    }, [rows, order.items]);

    // decision.ok إلزامي: أثناء الكتابة قد يمر السعر بلحظة فارغة/صفرية
    // فتُرجع buildQuoteDecision ok:false — لا يصح عندها الحكم بأي اتجاه (لا
    // "سيُعتمد آلياً" ولا نقيضها)، فيبقى الزر/التلميح على صياغتهما المحايدة
    // المعتادة إلى أن تكتمل المراجعة. هذا أيضاً ما يمنع الوميض بين الحالتين مع
    // كل ضغطة مفتاح: التغيّر الوحيد الذي يقلب willAutoApprove هو تغيّر فعلي في
    // قرار مكتمل، لا حالة وسيطة غير صالحة.
    const willAutoApprove =
        decisionPreview.ok && shouldAutoApprove(decisionPreview.summary, order.items.length);

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/warehouse-portal/orders/${order.id}/quote`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: rows.map((r) => ({
                        itemId: r.itemId,
                        status: r.decision,
                        quotedPrice: r.decision === "OUT_OF_STOCK" ? null : r.price,
                        quotedQuantity: r.decision === "PARTIAL" ? r.partialQty : null,
                        note: r.note || null,
                        bonusQuantity: r.decision === "OUT_OF_STOCK" ? 0 : r.bonus,
                        // ميزة نقل تاريخ الانتهاء: تُرسَل في كل سطر في كل نداء — بنفس
                        // انضباط note/bonusQuantity أعلاه بالضبط، لأن PATCH .../quote
                        // يكتب الحقل استبدالاً كاملاً (لا دمجاً) في كل مرة (انظر
                        // base.expiryDate في route.ts). إرسالها فقط حين تُعدَّل كان
                        // سيصفّر بصمت قيمة محفوظة من عرض سابق عند إعادة التسعير بلا
                        // لمس هذا الحقل تحديداً.
                        //
                        // batchNumber لم يعد يُرسَل إطلاقاً (قرار صاحب النظام 2026-09):
                        // الخادم يولّده بنفسه في كل استجابة PATCH (computeShipmentRefs
                        // في route.ts) بصرف النظر عمّا يصل في body — حتى لو أُرسل هنا
                        // حقل بهذا الاسم فالخادم لا يقرأه أبداً (انظر عدم وجود
                        // input.batchNumber في route.ts).
                        expiryDate: r.decision === "OUT_OF_STOCK" ? null : (r.expiryDate || null),
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.details && Array.isArray(data.details)) {
                    toast.error(data.details[0]);
                } else {
                    toast.error(data.error ?? "فشل إرسال العرض");
                }
                return;
            }
            onQuoted(
                order.id,
                data.order?.totalAmount ?? total,
                Boolean(data.autoApproved),
                willAutoApprove,
                data.autoApproveReason ?? null
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            // نفس تبرير سطر القائمة: هذه شاشة التسعير التي يُلتزَم فيها بعميل
            // فعلياً، فلا يجوز أن يظهر اسم الفرع («الفرع الرئيسي» في كل
            // الصيدليات) وحده بلا اسم المؤسسة.
            title={`مراجعة الطلب ${order.orderNumber ?? ""} — ${order.branch.organization?.name ?? "—"} (${order.branch.name})`}
            maxWidthClass="max-w-4xl"
        >
            <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-card p-6 shadow-xl" dir="rtl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">
                        مراجعة الطلب {order.orderNumber ?? ""} — {order.branch.organization?.name ?? "—"} ({order.branch.name})
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                {/* تلميح مكتوم واحد فوق القائمة كلها، لا لكل سطر — تاريخ الانتهاء
                    أدناه وعدٌ من المذخر وقت التسعير لا إثبات، والصيدلية هي من تتحقّق
                    منه فعلياً عند الاستلام (انظر قاعدة الأولوية في
                    app/dashboard/purchases/[id]/receive/page.tsx). رقم الدفعة لم يعد
                    جزءاً من هذا الوعد إطلاقاً (قرار صاحب النظام 2026-09): يُصدره
                    النظام آلياً — انظر عمود "مرجع الشحنة" القرائي فقط في كل سطر
                    أدناه — فلا داعي لذكره هنا مع تاريخ الانتهاء. canQuote إلزامي هنا
                    بنفس تبرير تلميح willAutoApprove أدناه بالضبط: هذه النافذة نفسها
                    تُفتَح للعرض فقط على طلب QUOTED/APPROVED مُرسَل منذ أيام — بصيغة
                    الحاضر «تُعلنه أنت الآن» كانت لتصف هناك وعداً كأنه لا يزال قائماً
                    وقابلاً للتعديل، وهي نفس كذبة الصياغة التي أُصلحت هناك. */}
                {canQuote && rows.some((r) => r.decision !== "OUT_OF_STOCK") && (
                    <p className="mb-3 text-xs text-muted-foreground">
                        تاريخ الانتهاء ما تُعلنه أنت الآن — الصيدلية تتحقّق منه فعلياً عند استلام الشحنة.
                    </p>
                )}

                <div className="space-y-3">
                    {order.items.map((it) => {
                        const row = rows.find((r) => r.itemId === it.id)!;
                        return (
                            <div key={it.id} className="space-y-3 rounded-lg border p-4">
                                {/* الرأس: اسم الصنف بارزاً + الباركود مكتوماً بخط أحادي +
                                    الكمية/السعر المتوقعان كبيانات وصفية مكتومة — لا حقل
                                    قابل للتعديل هنا إطلاقاً (تصميم Task B). */}
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <div className="flex flex-wrap items-baseline gap-2">
                                        <span className="font-bold text-foreground">{it.drug.tradeName}</span>
                                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                                            {it.drug.barcode}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        مطلوب: {it.quantity} × توقع {it.unitPrice.toLocaleString("ar-IQ")} د.ع
                                    </span>
                                </div>

                                {/* القرار: متوفر/جزئي/نافد في سطره الخاص وحده — هذا الخيار
                                    الأساسي، فلا يُخلَط بأي حقل آخر (تصميم Task B). */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {(
                                        [
                                            ["AVAILABLE", "متوفر"],
                                            ["PARTIAL", "جزئي"],
                                            ["OUT_OF_STOCK", "نافد"],
                                        ] as Array<[ItemDecision, string]>
                                    ).map(([v, l]) => (
                                        <button
                                            key={v}
                                            onClick={() => setRows((prev) => prev.map((r) => (r.itemId === it.id ? { ...r, decision: v } : r)))}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                                                row.decision === v ? "bg-primary text-primary-foreground" : "bg-muted"
                                            }`}
                                        >
                                            {l}
                                        </button>
                                    ))}
                                </div>

                                {/* التفاصيل: شبكة محاذاة بعناوين فوق كل حقل (تصميم Task B) بدل
                                    الصف الأفقي السابق متفاوت العرض. عمود واحد بعرض ضيق ثم
                                    تتوسّع — لا تمرير أفقي أبداً. تُخفى بالكامل حين الصنف نافد
                                    (نفس الشرط السابق بلا أي تغيير) لأن الخادم يُصفِّر كل هذه
                                    الحقول بلا شرط لهذه الحالة (انظر base في route.ts). */}
                                {row.decision !== "OUT_OF_STOCK" && (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <div className="flex flex-col gap-1">
                                            <label htmlFor={`price-${it.id}`} className="text-xs text-muted-foreground">
                                                السعر
                                            </label>
                                            <input
                                                id={`price-${it.id}`}
                                                type="number"
                                                min={1}
                                                value={row.price}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((r) => (r.itemId === it.id ? { ...r, price: Number(e.target.value) } : r))
                                                    )
                                                }
                                                className="h-9 w-full rounded border bg-muted px-2 text-sm"
                                            />
                                        </div>

                                        {row.decision === "PARTIAL" && (
                                            <div className="flex flex-col gap-1">
                                                <label htmlFor={`partial-${it.id}`} className="text-xs text-muted-foreground">
                                                    الكمية المتاحة
                                                </label>
                                                <input
                                                    id={`partial-${it.id}`}
                                                    type="number"
                                                    min={1}
                                                    max={it.quantity - 1}
                                                    value={row.partialQty}
                                                    onChange={(e) =>
                                                        setRows((prev) =>
                                                            prev.map((r) => (r.itemId === it.id ? { ...r, partialQty: Number(e.target.value) } : r))
                                                        )
                                                    }
                                                    className="h-9 w-full rounded border bg-muted px-2 text-sm"
                                                />
                                            </div>
                                        )}

                                        <div className="flex flex-col gap-1">
                                            <label htmlFor={`bonus-${it.id}`} className="text-xs text-muted-foreground">
                                                بونص
                                                {row.bonus > 0 && (
                                                    <span className="mr-1 font-medium text-success">+{row.bonus} مجاناً</span>
                                                )}
                                            </label>
                                            <input
                                                id={`bonus-${it.id}`}
                                                type="number"
                                                min={0}
                                                value={row.bonus}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((r) => (r.itemId === it.id ? { ...r, bonus: Number(e.target.value) } : r))
                                                    )
                                                }
                                                className="h-9 w-full rounded border bg-muted px-2 text-sm"
                                            />
                                        </div>

                                        {/* dir="ltr" على الحقل نفسه فقط، لا الشبكة كلها: منتقي
                                            التاريخ الأصلي للمتصفح يعرض mm/dd/yyyy دوماً بصرف
                                            النظر عن dir/lang — لا سبيل لإعادة ترتيب شهر/يوم/سنة
                                            من CSS أو من هنا (لذلك العنوان أدناه يذكر الترتيب
                                            صراحة بدل ترك المستخدم يخمنه). لكن الحقل يعيش داخل
                                            نموذج RTL كامل (dir="rtl" على حاوية النافذة الجذرية)،
                                            وحقول input الرقمية/التاريخ عناصر مضمَّنة تتبع خاصية
                                            CSS direction الموروثة من dir تماماً مثل أي نص آخر —
                                            فبلا هذا التجاوز يُرث الحقل rtl فتنعكس أيقونة التقويم
                                            وموضع القراءة بصرياً (مشكلة موثّقة لأي حقل رقمي/تاريخ
                                            إنجليزي داخل نموذج عربي)، رغم أن محتواه أرقام إنجليزية
                                            بحتة لا معنى لعكسها. dir="ltr" يعيد الحقل لعرضه
                                            الطبيعي المصمَّم له. */}
                                        <div className="flex flex-col gap-1">
                                            <label htmlFor={`expiry-${it.id}`} className="text-xs text-muted-foreground">
                                                تاريخ الانتهاء (شهر/يوم/سنة)
                                            </label>
                                            <input
                                                id={`expiry-${it.id}`}
                                                type="date"
                                                dir="ltr"
                                                value={row.expiryDate}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((r) => (r.itemId === it.id ? { ...r, expiryDate: e.target.value } : r))
                                                    )
                                                }
                                                className="h-9 w-full rounded border bg-muted px-2 text-sm"
                                            />
                                        </div>

                                        {/* مرجع الشحنة: قراءة فقط دائماً — لا حقل إدخال. القيمة
                                            الفعلية يقرّرها الخادم عند الحفظ (computeShipmentRefs
                                            في route.ts)؛ ما يُعرَض هنا محسوب بنفس الدالة بالضبط
                                            فيطابقها حرفياً (انظر تعريف shipmentRefs أعلاه)، فيرى
                                            المذخر ما سيُصدره النظام دون إرسال أي قيمة لهذا الحقل
                                            في body أصلاً. */}
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-muted-foreground">مرجع الشحنة (يُصدره النظام)</span>
                                            <span
                                                className="flex h-9 items-center truncate rounded border bg-muted/60 px-2 font-mono text-xs text-muted-foreground"
                                                dir="ltr"
                                                title="يُصدره النظام تلقائياً عند إرسال العرض — ليس رقم الدفعة المطبوع على العلبة"
                                            >
                                                {shipmentRefs.get(it.id) ?? "—"}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* الملاحظة: عرض كامل أسفل الشبكة (تصميم Task B). */}
                                {row.decision !== "OUT_OF_STOCK" && (
                                    <div className="flex flex-col gap-1">
                                        <label htmlFor={`note-${it.id}`} className="text-xs text-muted-foreground">
                                            ملاحظة للصيدلية (اختياري)
                                        </label>
                                        <input
                                            id={`note-${it.id}`}
                                            value={row.note}
                                            onChange={(e) =>
                                                setRows((prev) =>
                                                    prev.map((r) => (r.itemId === it.id ? { ...r, note: e.target.value } : r))
                                                )
                                            }
                                            placeholder="ملاحظة للصيدلية (اختياري)"
                                            className="h-9 w-full rounded border bg-muted px-2 text-sm"
                                        />
                                    </div>
                                )}

                                {/* المرحلة 4 (بدائل الدواء): تظهر فقط حين يختار المذخر "نافد" محلياً —
                                    it.alternatives يصل جاهزاً ومُرشَّحاً (متوفر فعلاً + مُدرَج) من الـ API
                                    بصرف النظر عن حالة الصنف المخزَّنة، فلا تأخير حتى يُحفَظ القرار أولاً. */}
                                {row.decision === "OUT_OF_STOCK" && (
                                    <div className="mt-3 rounded-lg border border-dashed p-3">
                                        {it.alternatives && it.alternatives.length > 0 ? (
                                            <>
                                                <p className="mb-2 text-xs font-medium text-muted-foreground">
                                                    بدائل متوفرة لدى مذخرك — اختر واحداً لإضافته كاقتراح ضمن الملاحظة أدناه:
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {it.alternatives.map((alt) => (
                                                        <button
                                                            key={alt.barcode}
                                                            type="button"
                                                            onClick={() => applyAlternativeSuggestion(it.id, alt)}
                                                            className="rounded-lg border bg-muted px-3 py-1.5 text-right text-xs hover:bg-muted/70"
                                                        >
                                                            <span className="font-medium">{alt.tradeName}</span>
                                                            <span className="mr-1 text-muted-foreground">
                                                                — {alt.price.toLocaleString("ar-IQ")} د.ع · متوفر{" "}
                                                                {alt.sellableQuantity.toLocaleString("ar-IQ")}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                لا توجد بدائل مسجَّلة متوفرة لدى مذخرك لهذا الصنف حالياً.
                                            </p>
                                        )}
                                        <textarea
                                            value={row.note}
                                            onChange={(e) =>
                                                setRows((prev) =>
                                                    prev.map((r) => (r.itemId === it.id ? { ...r, note: e.target.value } : r))
                                                )
                                            }
                                            placeholder="ملاحظة/بديل مقترح للصيدلية (اختياري)"
                                            rows={2}
                                            className="mt-2 w-full rounded border bg-muted px-2 py-1 text-sm"
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div>
                        <span className="text-sm text-muted-foreground">إجمالي العرض: </span>
                        <span className="tabular-nums text-xl font-bold">{total.toLocaleString("ar-IQ")} د.ع</span>
                        {/* إصلاح صدق الواجهة (2026-09): سطر مكتوم واحد يشرح لماذا سيتغيّر
                            نص الزر — بصيغة "في الحالة العادية" لا وعداً مؤكَّداً، لأن
                            الخادم يبقى المرجع الوحيد وقد يرفض الاعتماد الآلي لسبب لا
                            تراه الواجهة (حدّ ائتمان، تغيّر متزامن...). يظهر فقط بعد
                            اكتمال حكم صالح على كل الأصناف (decision.ok) — لا رأي أثناء
                            الكتابة. */}
                        {/* canQuote إلزامي هنا أيضاً: هذه النافذة نفسها تُفتَح لعرض تفاصيل
                            طلب QUOTED/APPROVED (زر "عرض التفاصيل" في القائمة) — بلا هذا
                            الشرط كان التلميح سيصف طلباً أُرسل/اعتُمد فعلاً منذ أيام
                            بصيغة المستقبل ("سيُرسَل"/"فور الإرسال")، وهي كذبة جديدة من
                            نفس النوع الذي جئنا لإصلاحه. */}
                        {canQuote && decisionPreview.ok && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {willAutoApprove
                                    ? "العرض يطابق طلب الصيدلية تماماً — يُعتمد آلياً في الحالة العادية فور الإرسال، بلا انتظار قرارها."
                                    : "العرض يختلف عن طلب الصيدلية — سيُرسَل وينتظر اعتمادها اليدوي."}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                            إغلاق
                        </button>
                        {canQuote && (
                            <button
                                onClick={submit}
                                disabled={saving}
                                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving
                                    ? (willAutoApprove ? "جارٍ الاعتماد…" : "جارٍ الإرسال…")
                                    : (willAutoApprove ? "اعتماد وتجهيز الشحن" : "إرسال العرض للصيدلية")}
                            </button>
                        )}
                    </div>
                </div>

                {order.events.length > 0 && (
                    <div className="mt-5 rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
                        <p className="mb-2 font-bold text-foreground">سجل الأحداث</p>
                        {order.events.map((ev) => (
                            <div key={ev.id}>
                                {new Date(ev.createdAt).toLocaleString("ar-IQ")} — {ev.type}
                                {ev.actorName ? ` (${ev.actorName})` : ""}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
