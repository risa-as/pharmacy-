"use client";

// المرحلة 3 من ميزة المذاخر: عميل صندوق الطلبات — قائمة بفلترة الحالة +
// شاشة التسعير/المراجعة (لكل صنف: متوفر/جزئي/نافد + السعر النهائي) + إرسال العرض.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import StatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import Modal from "@/app/warehouse/_components/Modal";
import { computeBonusUnits } from "@/app/lib/warehouse-bonus";

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
    branch: { name: string };
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

export default function OrdersClient({ initialOrders }: { initialOrders: Order[] }) {
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
                    <div className="flex flex-wrap gap-1">
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
                                <span className="text-sm text-muted-foreground">من: {o.branch.name}</span>
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
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {reviewOrder && (
                <ReviewModal
                    order={reviewOrder}
                    onClose={() => setReviewOrder(null)}
                    onQuoted={async (orderId, newTotal) => {
                        setReviewOrder(null);
                        await refreshOne(orderId);
                        void newTotal;
                        toast.success("أُرسل العرض للصيدلية");
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
    onQuoted: (orderId: string, total: number) => void;
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
            };
        })
    );
    const [saving, setSaving] = useState(false);

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
            onQuoted(order.id, data.order?.totalAmount ?? total);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title={`مراجعة الطلب ${order.orderNumber ?? ""} — ${order.branch.name}`} maxWidthClass="max-w-4xl">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-card p-6 shadow-xl" dir="rtl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">
                        مراجعة الطلب {order.orderNumber ?? ""} — {order.branch.name}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                <div className="space-y-3">
                    {order.items.map((it) => {
                        const row = rows.find((r) => r.itemId === it.id)!;
                        return (
                            <div key={it.id} className="rounded-lg border p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold">{it.drug.tradeName}</span>
                                    <span className="font-mono text-xs text-muted-foreground">{it.drug.barcode}</span>
                                    <span className="text-sm text-muted-foreground">
                                        مطلوب: {it.quantity} × توقع {it.unitPrice.toLocaleString("ar-IQ")} د.ع
                                    </span>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
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
                                    {row.decision !== "OUT_OF_STOCK" && (
                                        <label className="flex items-center gap-1 text-sm">
                                            السعر:
                                            <input
                                                type="number"
                                                min={1}
                                                value={row.price}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((r) => (r.itemId === it.id ? { ...r, price: Number(e.target.value) } : r))
                                                    )
                                                }
                                                className="w-28 rounded border bg-muted px-2 py-1 text-sm"
                                            />
                                        </label>
                                    )}
                                    {row.decision === "PARTIAL" && (
                                        <label className="flex items-center gap-1 text-sm">
                                            الكمية المتاحة:
                                            <input
                                                type="number"
                                                min={1}
                                                max={it.quantity - 1}
                                                value={row.partialQty}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((r) => (r.itemId === it.id ? { ...r, partialQty: Number(e.target.value) } : r))
                                                    )
                                                }
                                                className="w-20 rounded border bg-muted px-2 py-1 text-sm"
                                            />
                                        </label>
                                    )}
                                    {row.decision !== "OUT_OF_STOCK" && (
                                        <label className="flex items-center gap-1 text-sm">
                                            بونص:
                                            <input
                                                type="number"
                                                min={0}
                                                value={row.bonus}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((r) => (r.itemId === it.id ? { ...r, bonus: Number(e.target.value) } : r))
                                                    )
                                                }
                                                className="w-20 rounded border bg-muted px-2 py-1 text-sm"
                                            />
                                            {row.bonus > 0 && (
                                                <span className="font-medium text-success">+{row.bonus} مجاناً</span>
                                            )}
                                        </label>
                                    )}
                                    {row.decision !== "OUT_OF_STOCK" && (
                                        <input
                                            value={row.note}
                                            onChange={(e) =>
                                                setRows((prev) =>
                                                    prev.map((r) => (r.itemId === it.id ? { ...r, note: e.target.value } : r))
                                                )
                                            }
                                            placeholder="ملاحظة للصيدلية (اختياري)"
                                            className="mr-auto w-52 rounded border bg-muted px-2 py-1 text-sm"
                                        />
                                    )}
                                </div>

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
                                {saving ? "جارٍ الإرسال…" : "إرسال العرض للصيدلية"}
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
