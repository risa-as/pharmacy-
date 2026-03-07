import { prisma } from "@/app/lib/prisma";
import { BarChart3, TrendingUp, AlertOctagon } from "lucide-react";
import BestSellingChart from "@/app/ui/dashboard/reports/best-selling-chart";
import StagnantItemsTable from "@/app/ui/dashboard/reports/stagnant-items-table";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";


export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null; // Handle generically for server component
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const stagnantPeriod = typeof searchParams.stagnantPeriod === 'string' ? parseInt(searchParams.stagnantPeriod) : 90;

    // --- 1. Best Selling Items (Last 30 Days) ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const bestSellingData = await prisma.saleItem.groupBy({
        by: ['drugId'],
        where: {
            sale: {
                createdAt: { gte: thirtyDaysAgo },
                ...tenantBranchWhere
            }
        },
        _sum: {
            quantity: true,
            price: true // We ideally want total revenue (qty * price), but groupBy limits this. 
            // We'll approx or fetch details. 
            // Actually, saleItem has 'price' (unit price) and 'quantity'. 
            // We can't sum (price * quantity) directly in groupBy easily without raw query or fetch & process.
            // Let's fetch Top 50 grouped, then populate details.
        },
        orderBy: {
            _sum: {
                quantity: 'desc'
            }
        },
        take: 10,
    });

    // Populate Drug Names & Calculate Totals
    const bestSellingItems = await Promise.all(bestSellingData.map(async (item: any) => {
        const drug = await prisma.globalDrug.findUnique({
            where: { id: item.drugId },
            select: { tradeName: true }
        });

        // Approximate Total Revenue for this item in period
        // For accurate revenue, we should sum (quantity * price) for each saleItem. 
        // Prisma groupBy doesn't support computed aggregation effectively in one go.
        // Let's do a separate aggregation or just rely on Quantity for "Best Selling" definition.
        // We will show Quantity primarily.

        // Let's calculate accurate revenue for these top 10 items
        const revenueAgg = await prisma.saleItem.findMany({
            where: {
                drugId: item.drugId,
                sale: {
                    createdAt: { gte: thirtyDaysAgo },
                    ...tenantBranchWhere
                }
            },
            select: { quantity: true, price: true }
        });

        const totalRevenue = revenueAgg.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0);

        return {
            name: drug?.tradeName || 'Unknown',
            quantity: item._sum.quantity || 0,
            total: totalRevenue
        };
    }));

    // --- 2. Stagnant Items (Rawakeed) ---
    // Items with Stock > 0 AND No Sales in last X days

    // Date threshold
    const stagnantThresholdDate = new Date();
    stagnantThresholdDate.setDate(stagnantThresholdDate.getDate() - stagnantPeriod);

    // 1. Get all inventory with stock > 0
    // Note: Inventory is per branch. We should probably aggregate or show global stagnation?
    // Let's show Global Stagnation for simplicity (or per branch if needed, but here we assume Admin view).
    // If we want per branch, we'd filter by branchId. Assuming 'Admin' sees all or aggregate.
    // Let's check `Inventory` model. It has `drugId` and `quantity` via `Batches` aggregation?
    // Wait, Inventory has `batches`. Correct stock is sum of batches.
    // Or simpler: We check `GlobalDrug` that hasn't moved.

    // Strategy:
    // A. Find IDs of drugs sold after threshold.
    // B. Find GlobalDrugs (or Inventories) NOT in that list AND have Stock.

    const soldDrugIds = await prisma.saleItem.findMany({
        where: {
            sale: {
                createdAt: { gte: stagnantThresholdDate },
                ...tenantBranchWhere
            }
        },
        select: { drugId: true },
        distinct: ['drugId']
    }).then(items => items.map((i: any) => i.drugId));

    // Get Drugs that are NOT in soldDrugIds
    const stagnantDrugs = await prisma.globalDrug.findMany({
        where: {
            id: { notIn: soldDrugIds },
            inventories: {
                some: {
                    ...tenantBranchWhere,
                    batches: {
                        some: {
                            quantity: { gt: 0 }
                        }
                    }
                }
            }
        },
        include: {
            inventories: {
                include: {
                    batches: true
                }
            },
            saleItems: {
                orderBy: { sale: { createdAt: 'desc' } },
                take: 1,
                include: { sale: true }
            }
        },
        take: 50 // Limit to 50 for performance
    });

    const stagnantItemsMapped = stagnantDrugs.map((drug: any) => {
        // Calculate total stock across all branches
        const totalStock = drug.inventories.reduce((acc: number, inv: any) => {
            return acc + inv.batches.reduce((bAcc: number, batch: any) => bAcc + batch.quantity, 0);
        }, 0);

        // Last Sale Date (ever)
        const lastSale = drug.saleItems[0]?.sale.createdAt || null;

        // Days since last sale (or since creation if never sold?)
        // If never sold, we can use CreatedAt or just a high number.
        // Let's use days since today.
        const referenceDate = lastSale || drug.createdAt;
        const diffTime = Math.abs(new Date().getTime() - new Date(referenceDate).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
            id: drug.id,
            tradeName: drug.tradeName,
            stock: totalStock,
            lastSaleDate: lastSale,
            daysSinceLastSale: diffDays
        };
    }).filter((item: any) => item.stock > 0); // Double check stock > 0

    return (
        <div className="glass-card space-y-8 w-full p-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                    <BarChart3 className="w-8 h-8 text-primary" />
                    التقارير التحليلية
                </h1>
            </div>

            {/* Top Section: Best Selling */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card p-6 rounded-xl border border-border shadow-sm">
                    <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-success" />
                        الأصناف الأكثر مبيعاً (آخر 30 يوم)
                    </h3>
                    <BestSellingChart data={bestSellingItems} />
                </div>

                {/* Summary Card / List */}
                <div className="lg:col-span-1 bg-card p-6 rounded-xl border border-border shadow-sm">
                    <h3 className="text-lg font-bold text-foreground mb-4">ملخص الأداء</h3>
                    <div className="space-y-4">
                        {bestSellingItems.slice(0, 5).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <span className="text-foreground font-medium text-sm truncate max-w-[120px]" title={item.name}>
                                    {idx + 1}. {item.name}
                                </span>
                                <div className="text-left">
                                    <div className="font-bold text-primary">{item.quantity} عبوة</div>
                                    <div className="text-xs text-muted-foreground">{item.total.toLocaleString()} د.ع</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Section: Stagnant Items */}
            <div>
                <StagnantItemsTable items={stagnantItemsMapped} currentPeriod={stagnantPeriod} />
            </div>
        </div>
    );
}
