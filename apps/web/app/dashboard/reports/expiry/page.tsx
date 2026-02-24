import { prisma } from "@/app/lib/prisma";
import { AlertTriangle, Clock, CheckCircle, XCircle, Package } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

export default async function ExpiryReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const in90Days = new Date();
    in90Days.setDate(in90Days.getDate() + 90);

    // Fetch all batches with their drug info, filtered by branch
    const batches = await prisma.batch.findMany({
        where: {
            quantity: { gt: 0 },
            ...(branchId ? { inventory: { branchId } } : {}),
        },
        include: {
            inventory: {
                include: {
                    drug: { select: { tradeName: true, barcode: true } },
                    branch: { select: { name: true } },
                },
            },
        },
        orderBy: { expiryDate: "asc" },
    });

    // Categorize
    const expired: typeof batches = [];
    const critical: typeof batches = [];
    const warning: typeof batches = [];
    const safe: typeof batches = [];

    batches.forEach((batch) => {
        const expiry = new Date(batch.expiryDate);
        if (expiry < now) expired.push(batch);
        else if (expiry < in30Days) critical.push(batch);
        else if (expiry < in90Days) warning.push(batch);
        else safe.push(batch);
    });

    const expiredValue = expired.reduce((s, b) => s + b.quantity * b.inventory.cost, 0);
    const criticalValue = critical.reduce((s, b) => s + b.quantity * b.inventory.cost, 0);

    const categories = [
        {
            title: "منتهية الصلاحية",
            icon: XCircle,
            items: expired,
            count: expired.length,
            color: "red",
            bgColor: "bg-destructive/10",
            borderColor: "border-red-200",
            iconColor: "text-destructive",
            textColor: "text-destructive",
            value: expiredValue,
        },
        {
            title: "حرجة (أقل من 30 يوم)",
            icon: AlertTriangle,
            items: critical,
            count: critical.length,
            color: "orange",
            bgColor: "bg-warning/10",
            borderColor: "border-orange-200",
            iconColor: "text-warning",
            textColor: "text-warning",
            value: criticalValue,
        },
        {
            title: "تحذيرية (30-90 يوم)",
            icon: Clock,
            items: warning,
            count: warning.length,
            color: "yellow",
            bgColor: "bg-yellow-50",
            borderColor: "border-yellow-200",
            iconColor: "text-yellow-600",
            textColor: "text-yellow-700",
            value: warning.reduce((s, b) => s + b.quantity * b.inventory.cost, 0),
        },
        {
            title: "آمنة (أكثر من 90 يوم)",
            icon: CheckCircle,
            items: safe,
            count: safe.length,
            color: "green",
            bgColor: "bg-success/10",
            borderColor: "border-green-200",
            iconColor: "text-success",
            textColor: "text-success",
            value: null,
        },
    ];

    function getDaysRemaining(expiryDate: Date) {
        const diff = new Date(expiryDate).getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                <AlertTriangle className="w-8 h-8 text-warning" />
                📅 تقرير الأدوية المنتهية الصلاحية
            </h1>

            {/* Branch Filter */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/expiry" />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {categories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                        <div
                            key={cat.title}
                            className={`p-5 rounded-xl border ${cat.bgColor} ${cat.borderColor}`}
                        >
                            <div className={`flex items-center gap-2 text-sm mb-2 ${cat.iconColor}`}>
                                <Icon className="w-5 h-5" />
                                <span className="font-bold">{cat.title}</span>
                            </div>
                            <div className={`text-3xl font-bold ${cat.textColor}`}>
                                {cat.count} دفعة
                            </div>
                            {cat.value !== null && cat.value > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                    القيمة: {cat.value.toLocaleString()} د.ع
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Expired + Critical Tables */}
            {categories.slice(0, 3).map((cat) => {
                if (cat.items.length === 0) return null;
                const Icon = cat.icon;
                return (
                    <div key={cat.title} className="bg-card rounded-xl border shadow-sm overflow-hidden">
                        <div className={`px-6 py-4 ${cat.bgColor} border-b ${cat.borderColor} flex items-center gap-2`}>
                            <Icon className={`w-5 h-5 ${cat.iconColor}`} />
                            <h2 className={`font-bold text-lg ${cat.textColor}`}>
                                {cat.title} ({cat.items.length})
                            </h2>
                        </div>
                        <table className="w-full">
                            <thead className="bg-muted text-muted-foreground text-sm border-b">
                                <tr>
                                    <th className="px-4 py-3 text-right font-bold">اسم الدواء</th>
                                    <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                    <th className="px-4 py-3 text-right font-bold">رقم الدفعة</th>
                                    <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                    <th className="px-4 py-3 text-right font-bold">تاريخ الانتهاء</th>
                                    <th className="px-4 py-3 text-right font-bold">المتبقي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {cat.items.map((batch) => {
                                    const days = getDaysRemaining(batch.expiryDate);
                                    return (
                                        <tr key={batch.id} className="hover:bg-muted">
                                            <td className="px-4 py-3 font-bold text-foreground">
                                                {batch.inventory.drug.tradeName}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {batch.inventory.branch.name}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                                                {batch.batchNumber}
                                            </td>
                                            <td className="px-4 py-3 font-bold">{batch.quantity}</td>
                                            <td className="px-4 py-3 text-sm">
                                                {new Date(batch.expiryDate).toLocaleDateString("ar-IQ")}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`px-2 py-1 rounded-md text-xs font-bold ${days < 0
                                                        ? "bg-destructive/10 text-destructive"
                                                        : days < 30
                                                            ? "bg-warning/10 text-warning"
                                                            : "bg-yellow-100 text-yellow-700"
                                                        }`}
                                                >
                                                    {days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `${days} يوم`}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            {batches.length === 0 && (
                <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>لا توجد دفعات مسجلة في المخزون.</p>
                </div>
            )}

            <div className="bg-primary/10 p-4 rounded-lg text-sm text-blue-800">
                ملاحظة: يعرض هذا التقرير الدفعات التي تحتوي على كمية أكبر من صفر فقط. الأدوية المنتهية يجب سحبها من الرفوف فوراً.
            </div>
        </div>
    );
}
