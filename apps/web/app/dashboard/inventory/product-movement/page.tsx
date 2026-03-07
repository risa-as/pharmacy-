import { prisma } from "@/app/lib/prisma";
import { Activity, ArrowUpDown, Search } from "lucide-react";

import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


export default async function ProductMovementPage({
    searchParams,
}: {
    searchParams?: { barcode?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const barcode = searchParams?.barcode?.trim();

    let movements: {
        date: Date;
        type: string;
        quantity: number;
        reference: string;
        branch: string;
    }[] = [];
    let selectedDrug: { tradeName: string; barcode: string } | null = null;
    let notFound = false;
    let totalIn = 0;
    let totalOut = 0;

    if (barcode) {
        const drug = await prisma.globalDrug.findFirst({
            where: { barcode },
            select: { id: true, tradeName: true, barcode: true },
        });

        if (!drug) {
            notFound = true;
        } else {
            selectedDrug = { tradeName: drug.tradeName, barcode: drug.barcode };

            const saleItems = await prisma.saleItem.findMany({
                where: {
                    drugId: drug.id,
                    sale: tenantBranchWhere
                },
                include: { sale: { include: { branch: true } } },
                orderBy: { sale: { createdAt: "desc" } },
                take: 100,
            });

            for (const si of saleItems) {
                movements.push({
                    date: si.sale.createdAt,
                    type: "بيع",
                    quantity: -si.quantity,
                    reference: `فاتورة #${si.saleId.slice(0, 8)}`,
                    branch: si.sale.branch.name,
                });
                totalOut += si.quantity;
            }

            const purchaseItems = await prisma.purchaseItem.findMany({
                where: {
                    drugId: drug.id,
                    purchase: tenantBranchWhere
                },
                include: { purchase: { include: { branch: true } } },
                orderBy: { purchase: { createdAt: "desc" } },
                take: 100,
            });

            for (const pi of purchaseItems) {
                movements.push({
                    date: pi.purchase.createdAt,
                    type: "شراء",
                    quantity: pi.quantity,
                    reference: `مشتريات #${pi.purchaseId.slice(0, 8)}`,
                    branch: pi.purchase.branch.name,
                });
                totalIn += pi.quantity;
            }

            movements.sort((a, b) => b.date.getTime() - a.date.getTime());
        }
    }

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Activity className="w-7 h-7 text-primary" />
                    حركة منتج
                </h1>
            </div>

            {/* Barcode Search */}
            <div className="bg-card rounded-xl border border-border p-6 mb-6">
                <form className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-foreground mb-2">
                            باركود المنتج
                        </label>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                name="barcode"
                                defaultValue={barcode || ""}
                                placeholder="امسح الباركود أو اكتبه يدوياً..."
                                autoFocus
                                className="w-full rounded-lg border border-border pr-9 pl-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-primary font-mono"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
                    >
                        عرض الحركة
                    </button>
                </form>
            </div>

            {/* Not found */}
            {notFound && (
                <div className="bg-destructive/10 rounded-xl border border-destructive/30 p-6 text-center text-destructive mb-6">
                    <p className="font-bold">لم يُعثر على منتج بالباركود: <span className="font-mono">{barcode}</span></p>
                </div>
            )}

            {/* Stats */}
            {selectedDrug && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className="bg-card rounded-xl border border-border p-4">
                            <div className="text-lg font-bold text-foreground">{selectedDrug.tradeName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{selectedDrug.barcode}</div>
                        </div>
                        <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                            <div className="text-3xl font-bold text-success">+{totalIn}</div>
                            <div className="text-sm text-success">إجمالي الوارد</div>
                        </div>
                        <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                            <div className="text-3xl font-bold text-destructive">-{totalOut}</div>
                            <div className="text-sm text-destructive">إجمالي الصادر</div>
                        </div>
                    </div>

                    {/* Movement table */}
                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                        {movements.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <ArrowUpDown className="w-12 h-12 mx-auto mb-3 opacity-40" />
                                <p>لا توجد حركة مسجلة لهذا المنتج</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                                        <th className="px-4 py-3 text-right font-bold">النوع</th>
                                        <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                        <th className="px-4 py-3 text-right font-bold">المرجع</th>
                                        <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {movements.map((m, idx) => (
                                        <tr key={idx} className="hover:bg-muted">
                                            <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                                {new Date(m.date).toLocaleDateString("ar-IQ", {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-bold ${m.type === "شراء"
                                                    ? "bg-success/10 text-success"
                                                    : "bg-destructive/10 text-destructive"
                                                    }`}>
                                                    {m.type}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-3 font-bold ${m.quantity > 0 ? "text-success" : "text-destructive"}`}>
                                                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground text-sm">{m.reference}</td>
                                            <td className="px-4 py-3 text-muted-foreground text-sm">{m.branch}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {!barcode && !notFound && (
                <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground">
                    <ArrowUpDown className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-bold">امسح باركود منتج لعرض حركته</p>
                    <p className="text-sm mt-1">ستظهر هنا جميع عمليات البيع والشراء للمنتج المحدد</p>
                </div>
            )}
        </div>
    );
}
