// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): لوحة المذخر الرئيسية —
// أرقام حية بدل البطاقات الثابتة السابقة، وكل بطاقة/قسم يُخفى كاملاً (لا
// يُعرَض بصفر) عندما لا يملك الفاعل الصلاحية المطلوبة له. كل رقم مالي/مخزوني
// هنا يُحسَب عبر نفس دوال app/lib/warehouse-reports.ts وwarehouse-report-data.ts
// وwarehouse-stock.ts وwarehouse-accounts.ts المستخدَمة في صفحة التقارير
// والمخزون والحسابات — لا حساب مستقل مكرَّر هنا بأي شكل.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import Link from "next/link";
import { getWarehousePermissions } from "@/app/lib/warehouse-permissions";
import { getSoldLines, getFulfilmentItems } from "@/app/lib/warehouse-report-data";
import { salesByPeriod, fulfilmentRate, type FulfilmentRateResult } from "@/app/lib/warehouse-reports";
import { summarizeReceivables } from "@/app/lib/warehouse-accounts";
import { summarizeStock, isLowStock, expiryBucket } from "@/app/lib/warehouse-stock";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import { loadOpenReceivables } from '@/app/lib/warehouse-receivables';

export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ORDER_STATUS_LABELS: Record<string, string> = {
    SENT: "بانتظار بدء المراجعة",
    UNDER_REVIEW: "قيد المراجعة/التسعير",
    APPROVED: "بانتظار الشحن",
};

interface AttentionOrder {
    id: string;
    orderNumber: string | null;
    status: string;
    pharmacyName: string;
    createdAt: Date;
}

interface LowStockItem {
    id: string;
    tradeName: string;
    sellableQuantity: number;
    minStock: number;
}

interface ExpiringBatch {
    tradeName: string;
    batchNumber: string;
    expiryDate: Date;
    quantity: number;
    bucket: "EXPIRED" | "CRITICAL";
}

async function loadDashboard(warehouseId: string, permissions: ReturnType<typeof getWarehousePermissions>) {
    const now = new Date();
    const baghdadNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(baghdadNow.getUTCFullYear(), baghdadNow.getUTCMonth(), 1) - 3 * 60 * 60 * 1000);
    const days30Ago = new Date(now.getTime() - 30 * MS_PER_DAY);

    let ordersAwaitingQuote = 0;
    let ordersAwaitingShipment = 0;
    let attentionOrders: AttentionOrder[] = [];

    if (permissions.canViewOrders) {
        const [quoteCount, shipCount, orders] = await Promise.all([
            prisma.warehouseOrder.count({ where: { warehouseId, status: { in: ["SENT", "UNDER_REVIEW"] } } }),
            prisma.warehouseOrder.count({ where: { warehouseId, status: "APPROVED" } }),
            prisma.warehouseOrder.findMany({
                where: { warehouseId, status: { in: ["SENT", "UNDER_REVIEW", "APPROVED"] } },
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    createdAt: true,
                    branch: { select: { organization: { select: { name: true } } } },
                },
                orderBy: { createdAt: "asc" },
                take: 8,
            }),
        ]);
        ordersAwaitingQuote = quoteCount;
        ordersAwaitingShipment = shipCount;
        attentionOrders = orders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            pharmacyName: o.branch.organization.name,
            createdAt: o.createdAt,
        }));
    }

    let monthRevenue = 0;
    let sparkline: Array<{ key: string; total: number }> = [];

    if (permissions.canViewFinance) {
        // استعلام واحد يغطي أوسع النطاقين (بداية الشهر أو 30 يوماً، أيهما أبعد)
        // ثم فلترة في الذاكرة — بدل استعلامين منفصلين بنفس الانضمام (order →
        // items → drug → كتالوج) لنفس المذخر تقريباً في نفس الطلب.
        const rangeStart = monthStart.getTime() < days30Ago.getTime() ? monthStart : days30Ago;
        const combinedLines = await getSoldLines(warehouseId, { from: rangeStart, to: now });
        const monthLines = combinedLines.filter((l) => new Date(l.shippedAt).getTime() >= monthStart.getTime());
        const last30Lines = combinedLines.filter((l) => new Date(l.shippedAt).getTime() >= days30Ago.getTime());
        monthRevenue = monthLines.reduce((sum, l) => sum + l.lineTotal, 0);
        sparkline = salesByPeriod(last30Lines, "day", now);
    }

    let receivablesOutstanding = 0;
    let receivablesOverdue = 0;

    if (permissions.canViewFinance) {
        const invoices = await loadOpenReceivables(prisma, warehouseId);
        const summary = summarizeReceivables(invoices, now);
        receivablesOutstanding = summary.outstanding;
        receivablesOverdue = summary.overdue;
    }

    let lowStockCount = 0;
    let expiringSoonCount = 0;
    let lowStockItems: LowStockItem[] = [];
    let expiringBatches: ExpiringBatch[] = [];

    if (permissions.canViewStock) {
        const items = await prisma.warehouseCatalogItem.findMany({
            where: { warehouseId },
            select: {
                id: true,
                minStock: true,
                drug: { select: { tradeName: true } },
                batches: { select: { id: true, quantity: true, expiryDate: true, batchNumber: true } },
            },
        });

        const allExpiring: ExpiringBatch[] = [];
        for (const item of items) {
            const summary = summarizeStock(item.batches, now);
            if (isLowStock({ sellableQuantity: summary.totalQuantity, minStock: item.minStock })) {
                lowStockCount += 1;
                lowStockItems.push({
                    id: item.id,
                    tradeName: item.drug.tradeName,
                    sellableQuantity: summary.totalQuantity,
                    minStock: item.minStock,
                });
            }
            for (const batch of item.batches) {
                if (batch.quantity <= 0) continue;
                const bucket = expiryBucket(batch.expiryDate, now);
                if (bucket === "EXPIRED" || bucket === "CRITICAL") {
                    expiringSoonCount += 1;
                    allExpiring.push({
                        tradeName: item.drug.tradeName,
                        batchNumber: batch.batchNumber,
                        expiryDate: batch.expiryDate,
                        quantity: batch.quantity,
                        bucket,
                    });
                }
            }
        }
        lowStockItems = lowStockItems.slice(0, 8);
        expiringBatches = allExpiring.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime()).slice(0, 8);
    }

    let fulfilment: FulfilmentRateResult | null = null;
    if (permissions.canViewReports) {
        const items = await getFulfilmentItems(warehouseId, { from: days30Ago, to: now });
        fulfilment = fulfilmentRate(items);
    }

    return {
        ordersAwaitingQuote,
        ordersAwaitingShipment,
        attentionOrders,
        monthRevenue,
        sparkline,
        receivablesOutstanding,
        receivablesOverdue,
        lowStockCount,
        expiringSoonCount,
        lowStockItems,
        expiringBatches,
        fulfilment,
    };
}

function fmt(n: number): string {
    return Math.round(n).toLocaleString("ar-IQ-u-nu-latn");
}

/** سباركلاين مبيعات 30 يوماً — SVG خطي بسيط بلا مكتبة رسوم (القيد §8 من هذه المرحلة). */
function Sparkline({ points }: { points: Array<{ key: string; total: number }> }) {
    if (points.length === 0) {
        return <p className="text-xs text-muted-foreground">لا توجد مبيعات ضمن آخر 30 يوماً.</p>;
    }
    const width = 280;
    const height = 48;
    const max = Math.max(...points.map((p) => p.total), 1);
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
        const x = points.length > 1 ? i * stepX : width / 2;
        const y = height - (p.total / max) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const last = points[points.length - 1];

    return (
        <div>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="مبيعات آخر 30 يوماً">
                <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} className="text-primary" />
            </svg>
            <p className="tabular-nums mt-1 text-xs text-muted-foreground">
                آخر يوم ({last.key}): {fmt(last.total)} د.ع
            </p>
        </div>
    );
}

export default async function WarehouseHomePage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    // فاعل لا يتبع هذا المذخر أو غير فعّال: كل الصلاحيات false (نفس منطق fail-closed
    // في getWarehousePermissions لدور غير معروف) — كل الأقسام أدناه تُخفى، لا تُظهر أصفاراً.
    const permissions = belongsAndActive
        ? getWarehousePermissions(actor!)
        : getWarehousePermissions({ warehouseUserType: null, permissions: null });

    const mode = await prisma.warehouse.findUniqueOrThrow({where:{id:ctx.warehouseId},select:{operatingMode:true}});
    if(mode.operatingMode === 'ORDER_PORTAL') { permissions.canViewStock=false; permissions.canViewPurchases=false; permissions.canViewReps=false; }
    const data = await loadDashboard(ctx.warehouseId, permissions);

    // ── تجميع الحاويات حسب التسلسل الهرمي المطلوب: أرقام تحتاج إجراءً أولاً،
    // مؤشرات داعمة ثانياً، قوائم إجراء أخيراً. كل بطاقة تبقى مُشروطة بصلاحيتها
    // الخاصة تماماً كما كانت — أُعيد فقط ترتيب من يظهر أين، وأُعيد حساب شرط كل
    // حاوية (||) بحيث يبقى اتحاد البطاقات المعروضة مطابقاً تماماً للسابق.
    const showActionRow = permissions.canViewOrders || permissions.canViewStock;
    const showMetricsRow = permissions.canViewFinance || permissions.canViewReports;
    const showActionLists = permissions.canViewOrders || permissions.canViewStock;

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader title="لوحة المذخر" description="نظرة سريعة على طلبات الصيدليات، مبيعاتك، ومخزونك." />

            {/* المستوى 1 — أرقام تحتاج إجراءً منك الآن. كل بطاقة هنا مُشروطة
                بصلاحيتها الخاصة فقط — لا بـ canViewOrders كشرط جامع (تخصيص JSON
                فردي قد يمنح canViewStock بلا canViewOrders، انظر تعليق "التخصيص
                لا يُقيَّد بسقف الدور" في warehouse-permissions.ts؛ ربط بطاقة
                المخزون بصلاحية الطلبات كان سيخفيها خطأً عن هكذا مستخدم). */}
            {showActionRow && (
                <section className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">يحتاج إجراءً</h3>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {permissions.canViewOrders && (
                            <Link href="/warehouse/orders?status=REVIEW" className="rounded-lg border bg-card p-4 shadow-sm transition hover:shadow">
                                <p className="text-sm text-muted-foreground">طلبات بانتظار المراجعة/التسعير</p>
                                <p className="tabular-nums mt-2 text-3xl font-bold text-primary">{fmt(data.ordersAwaitingQuote)}</p>
                            </Link>
                        )}
                        {permissions.canViewOrders && (
                            <Link href="/warehouse/orders?status=APPROVED" className="rounded-lg border bg-card p-4 shadow-sm transition hover:shadow">
                                <p className="text-sm text-muted-foreground">طلبات بانتظار الشحن</p>
                                <p className="tabular-nums mt-2 text-3xl font-bold text-foreground">{fmt(data.ordersAwaitingShipment)}</p>
                            </Link>
                        )}
                        {permissions.canViewStock && (
                            <Link href="/warehouse/stock" className="rounded-lg border bg-card p-4 shadow-sm transition hover:shadow">
                                <p className="text-sm text-muted-foreground">أصناف تحت حد إعادة الطلب</p>
                                <p className="tabular-nums mt-2 text-3xl font-bold text-warning">{fmt(data.lowStockCount)}</p>
                            </Link>
                        )}
                        {/* يُخفى فقط لغياب الصلاحية (canViewStock) — لا لأن العدد صفر: صفر
                            دفعات مهدَّدة هو خبر جيد يستحق أن يُعرَض صراحة، لا أن يختفي كأن
                            التبويب لم يُحمَّل. */}
                        {permissions.canViewStock && (
                            <div className="rounded-lg border bg-card p-4 shadow-sm">
                                <p className="text-sm text-muted-foreground">دفعات تنتهي خلال 90 يوماً</p>
                                <p className={`tabular-nums mt-2 text-3xl font-bold ${data.expiringSoonCount > 0 ? "text-destructive" : "text-success"}`}>
                                    {fmt(data.expiringSoonCount)}
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* المستوى 2 — مؤشرات داعمة (وصفية، بلا إجراء مباشر مطلوب الآن). */}
            {showMetricsRow && (
                <section className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">مؤشرات الأداء</h3>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {permissions.canViewReports && data.fulfilment && (
                            <div className="rounded-lg border bg-card p-4 shadow-sm">
                                <p className="text-sm text-muted-foreground">نسبة التلبية (30 يوماً)</p>
                                <p className="tabular-nums mt-2 text-3xl font-bold text-success">{data.fulfilment.ratePercent.toLocaleString("ar-IQ-u-nu-latn")}٪</p>
                                <p className="mt-1 text-xs text-muted-foreground">من {fmt(data.fulfilment.totalLines)} بند محسوم</p>
                            </div>
                        )}
                        {permissions.canViewFinance && (
                            <div className="rounded-lg border bg-card p-4 shadow-sm">
                                <p className="text-sm text-muted-foreground">مبيعات الشهر الحالي</p>
                                <p className="tabular-nums mt-2 text-3xl font-bold">{fmt(data.monthRevenue)} د.ع</p>
                            </div>
                        )}
                        {permissions.canViewFinance && (
                            <div className="rounded-lg border bg-card p-4 shadow-sm">
                                <p className="text-sm text-muted-foreground">الذمم المدينة القائمة</p>
                                <p className="tabular-nums mt-2 text-3xl font-bold">{fmt(data.receivablesOutstanding)} د.ع</p>
                                <p className="tabular-nums mt-1 text-xs text-destructive">
                                    متأخر: {fmt(data.receivablesOverdue)} د.ع
                                </p>
                            </div>
                        )}
                        {permissions.canViewFinance && (
                            <div className="rounded-lg border bg-card p-4 shadow-sm">
                                <p className="mb-2 text-sm text-muted-foreground">مبيعات آخر 30 يوماً</p>
                                <Sparkline points={data.sparkline} />
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* المستوى 3 — قوائم إجراء: عناصر محدَّدة تحتاج نقرة للمتابعة. */}
            {showActionLists && (
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">قوائم تحتاج متابعة</h3>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {permissions.canViewOrders && (
                    <div className="rounded-lg border bg-card shadow-sm">
                        <div className="border-b p-4">
                            <h3 className="font-bold">طلبات تحتاج إجراءً</h3>
                        </div>
                        {data.attentionOrders.length === 0 ? (
                            <p className="p-4 text-sm text-muted-foreground">لا توجد طلبات معلَّقة حالياً.</p>
                        ) : (
                            <ul className="divide-y">
                                {data.attentionOrders.map((o) => (
                                    <li key={o.id}>
                                        <Link
                                            href={`/warehouse/orders?status=${o.status}`}
                                            className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/40"
                                        >
                                            <span>
                                                {o.pharmacyName}
                                                {o.orderNumber ? ` · ${o.orderNumber}` : ""}
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {ORDER_STATUS_LABELS[o.status] ?? o.status}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {permissions.canViewStock && (
                    <div className="rounded-lg border bg-card shadow-sm">
                        <div className="border-b p-4">
                            <h3 className="font-bold">أصناف تحت حد إعادة الطلب</h3>
                        </div>
                        {data.lowStockItems.length === 0 ? (
                            <p className="p-4 text-sm text-muted-foreground">لا توجد أصناف تحت الحد حالياً.</p>
                        ) : (
                            <ul className="divide-y">
                                {data.lowStockItems.map((it) => (
                                    <li key={it.id}>
                                        <Link href="/warehouse/stock" className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/40">
                                            <span>{it.tradeName}</span>
                                            <span className="tabular-nums shrink-0 text-xs text-warning">
                                                {fmt(it.sellableQuantity)} / حد {fmt(it.minStock)}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {permissions.canViewStock && (
                    <div className="rounded-lg border bg-card shadow-sm">
                        <div className="border-b p-4">
                            <h3 className="font-bold">دفعات تنتهي خلال 90 يوماً</h3>
                        </div>
                        {data.expiringBatches.length === 0 ? (
                            <p className="p-4 text-sm text-muted-foreground">لا توجد دفعات تحت خطر قريب.</p>
                        ) : (
                            <ul className="divide-y">
                                {data.expiringBatches.map((b, i) => (
                                    <li key={i}>
                                        <Link href="/warehouse/stock" className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/40">
                                            <span>
                                                {b.tradeName} <span className="text-xs text-muted-foreground">({b.batchNumber})</span>
                                            </span>
                                            <span className={`shrink-0 text-xs ${b.bucket === "EXPIRED" ? "text-destructive" : "text-warning"}`}>
                                                {b.expiryDate.toLocaleDateString("ar-IQ-u-nu-latn")}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
            </section>
            )}

            <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                <p className="font-medium text-foreground">كيف تعمل البوابة؟</p>
                <ol className="mt-2 list-inside list-decimal space-y-1">
                    <li>ارفع أدويتك وأسعارك من تبويب «أدويتي» (فردياً أو عبر ملف Excel).</li>
                    <li>عند وصول طلب من صيدلية سيظهر في تبويب «الطلبات».</li>
                    <li>حدد لكل صنف: متوفر / جزئي / نافد مع السعر النهائي، ثم أرسل العرض.</li>
                    <li>بعد اعتماد الصيدلية جهّز الشحن وحدّث حالة الطلب.</li>
                </ol>
            </div>
        </div>
    );
}
