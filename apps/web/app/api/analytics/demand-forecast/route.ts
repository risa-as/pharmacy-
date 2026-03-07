export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

// GET: Generate demand forecasts for a branch
export async function GET(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || tenantCtx.user.branchId;
        const days = Number(searchParams.get('days') || 30);

        if (!branchId) return NextResponse.json({ error: "branchId required" }, { status: 400 });

        // Get historical sales for the last 90 days grouped by drug
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const salesData = await prisma.saleItem.groupBy({
            by: ['drugId'],
            _sum: { quantity: true },
            where: {
                sale: {
                    branchId,
                    createdAt: { gte: ninetyDaysAgo }
                }
            },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 50
        });

        if (salesData.length === 0) {
            return NextResponse.json({
                forecasts: [],
                message: 'لا توجد بيانات مبيعات كافية للتنبؤ'
            });
        }

        // Get drug details
        const drugIds = salesData.map(s => s.drugId);
        const drugs = await prisma.globalDrug.findMany({
            where: { id: { in: drugIds } },
            select: { id: true, tradeName: true, barcode: true }
        });

        // Get current stock
        const inventories = await prisma.inventory.findMany({
            where: { branchId, drugId: { in: drugIds } },
            include: { batches: true }
        });

        const inventoryMap = new Map(inventories.map(i => [i.drugId, i]));
        const drugMap = new Map(drugs.map(d => [d.id, d]));

        // Moving Average Forecast algorithm
        const forecasts = salesData.map(sale => {
            const drug = drugMap.get(sale.drugId);
            const inv = inventoryMap.get(sale.drugId);
            const totalSold = sale._sum.quantity || 0;
            const dailyAvg = totalSold / 90;
            const predictedDemand = Math.ceil(dailyAvg * days);
            const currentStock = inv?.batches?.reduce((acc: number, batch: any) => acc + batch.quantity, 0) || 0;
            const minStock = inv?.minStock || 10;
            const daysUntilStockout = dailyAvg > 0 ? Math.floor(currentStock / dailyAvg) : 999;
            const suggestedOrder = Math.max(0, predictedDemand - currentStock + minStock);

            // Confidence based on data consistency
            const confidence = Math.min(0.95, 0.5 + (totalSold > 100 ? 0.3 : totalSold > 30 ? 0.2 : 0.1));

            return {
                drugId: sale.drugId,
                drugName: drug?.tradeName || 'غير معروف',
                barcode: drug?.barcode,
                totalSold90Days: totalSold,
                dailyAverage: Math.round(dailyAvg * 100) / 100,
                predictedDemand,
                currentStock,
                daysUntilStockout,
                suggestedOrder,
                confidence: Math.round(confidence * 100),
                urgency: daysUntilStockout <= 7 ? 'critical' : daysUntilStockout <= 14 ? 'warning' : 'normal'
            };
        });

        // Sort by urgency
        forecasts.sort((a, b) => {
            const urgencyOrder = { critical: 0, warning: 1, normal: 2 };
            return (urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 2) - (urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 2);
        });

        return NextResponse.json({
            forecasts,
            metadata: {
                branchId,
                forecastDays: days,
                dataWindow: 90,
                algorithm: 'moving_average',
                generatedAt: new Date().toISOString()
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
