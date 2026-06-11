export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { PackageMinus, Trash2, Clock, Banknote, ChevronDown, Info } from "lucide-react";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import ExpiryBatchesTable, { ExpiryRow } from "@/app/ui/inventory/expiry-batches-table";

export default async function ExpiredDamagedPage({
    searchParams,
}: {
    searchParams?: { branch?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere } = tenantCtx;
    const canWriteOff = tenantCtx.userPermissions.canDoStocktake;

    const selectedBranchId = searchParams?.branch;

    const inventoryFilter = selectedBranchId
        ? { ...tenantBranchWhere, branchId: selectedBranchId }
        : tenantBranchWhere;

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const batches = await prisma.batch.findMany({
        where: {
            quantity: { gt: 0 },
            inventory: inventoryFilter,
            expiryDate: { lte: thirtyDaysFromNow },
        },
        include: { inventory: { include: { drug: true, branch: true } } },
        orderBy: { expiryDate: "asc" },
    });

    const expired = batches.filter((b: any) => new Date(b.expiryDate) < now);
    const expiringSoon = batches.filter((b: any) => new Date(b.expiryDate) >= now);

    const expiredValue = expired.reduce((sum: number, b: any) => sum + b.quantity * b.costPrice, 0);
    const expiringSoonValue = expiringSoon.reduce((sum: number, b: any) => sum + b.quantity * b.costPrice, 0);
    const fmt = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

    const rows: ExpiryRow[] = batches.map((b: any) => {
        const exp = new Date(b.expiryDate);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
            id: b.id,
            drugName: b.inventory.drug.tradeName,
            barcode: b.inventory.drug.barcode ?? null,
            batchNumber: b.batchNumber ?? null,
            branchName: b.inventory.branch.name,
            quantity: b.quantity,
            costPrice: b.costPrice,
            expiryLabel: exp.toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" }),
            daysLeft,
            status: exp < now ? "expired" : "expiring",
        };
    });

    const statCards = [
        { label: "دفعات منتهية", value: String(expired.length), icon: Trash2, tone: "text-destructive", bg: "bg-destructive/10" },
        { label: "تنتهي خلال 30 يوم", value: String(expiringSoon.length), icon: Clock, tone: "text-warning", bg: "bg-warning/10" },
        { label: "قيمة المنتهية (د.ع)", value: fmt(expiredValue), icon: Banknote, tone: "text-destructive", bg: "bg-destructive/10" },
        { label: "قيمة قريبة الانتهاء (د.ع)", value: fmt(expiringSoonValue), icon: Banknote, tone: "text-warning", bg: "bg-warning/10" },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <PackageMinus className="w-6 h-6 text-destructive" />
                        التوالف والمنتهية الصلاحية
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        الدفعات المنتهية أو التي تنتهي صلاحيتها خلال 30 يوماً
                    </p>
                </div>
                <BranchFilter currentBranch={selectedBranchId} baseUrl="/dashboard/inventory/expired-damaged" />
            </div>

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">{card.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* دروب داون: شرح آلية الشطب */}
            {canWriteOff && (
                <details className="glass-card group">
                    <summary className="flex items-center gap-2 px-5 py-4 cursor-pointer list-none select-none">
                        <Info className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-bold text-foreground text-sm">كيف يعمل شطب الدفعات؟</span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground mr-auto transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-5 pb-5 pt-1 text-sm text-muted-foreground space-y-2.5 border-t border-border">
                        <p className="pt-3">
                            عند الضغط على <span className="font-bold text-destructive">شطب</span> لأي دفعة، يقوم النظام بالتالي:
                        </p>
                        <ol className="space-y-2 mr-1">
                            <li className="flex gap-2">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
                                <span><span className="font-semibold text-foreground">تصفير الكمية:</span> تُصبح كمية الدفعة صفراً وتختفي من المخزون المتاح للبيع فوراً.</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                                <span><span className="font-semibold text-foreground">تسجيل الخسارة:</span> تُسجَّل قيمة الدفعة (الكمية × سعر التكلفة) كمصروف في فئة <span className="font-semibold">«إتلاف مخزون»</span>، فتظهر ضمن تقارير المصروفات والأرباح.</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-success/10 text-success text-xs font-bold flex items-center justify-center">3</span>
                                <span><span className="font-semibold text-foreground">لا تأثير على النقد:</span> رصيد الصندوق النقدي لا يتأثر — الخسارة دفترية (محاسبية) وليست سحباً نقدياً.</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">4</span>
                                <span><span className="font-semibold text-foreground">سجل التدقيق:</span> تُحفظ العملية (المستخدم، الوقت، الدواء، الكمية، القيمة) في سجل التدقيق للمراجعة.</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-destructive/10 text-destructive text-xs font-bold flex items-center justify-center">!</span>
                                <span><span className="font-semibold text-destructive">لا يمكن التراجع:</span> تأكّد من الكمية قبل الشطب، فالعملية نهائية.</span>
                            </li>
                        </ol>
                    </div>
                </details>
            )}

            {/* الجدول */}
            {rows.length === 0 ? (
                <div className="glass-card py-16 text-center">
                    <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <PackageMinus className="w-8 h-8 text-success" />
                    </div>
                    <p className="text-foreground font-medium">لا توجد أدوية منتهية أو قريبة الانتهاء</p>
                    <p className="text-sm text-muted-foreground mt-1">جميع الدفعات ضمن فترة الصلاحية</p>
                </div>
            ) : (
                <ExpiryBatchesTable rows={rows} canWriteOff={canWriteOff} />
            )}
        </div>
    );
}
