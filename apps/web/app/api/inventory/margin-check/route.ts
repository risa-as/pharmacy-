import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

// POST: Check if a sale price is below minimum profit margin
// Body: { drugId, salePrice, branchId? }
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { drugId, salePrice, branchId } = body;

        if (!drugId || salePrice === undefined) {
            return NextResponse.json({ error: "drugId and salePrice are required" }, { status: 400 });
        }

        // Get company min margin setting
        const settings = await prisma.companySettings.findFirst();
        const minMargin = settings?.minProfitMargin ?? 5;

        // Get drug cost from inventory
        const bFilter = branchId || session.user.branchId;
        const inventory = await prisma.inventory.findFirst({
            where: { drugId, ...(bFilter ? { branchId: bFilter } : {}) },
            select: { cost: true }
        });

        if (!inventory) {
            return NextResponse.json({
                warning: false,
                message: 'لم يتم العثور على هذا الدواء في المخزون',
                cost: 0,
                margin: 0,
                minMargin
            });
        }

        const cost = inventory.cost;
        const profit = salePrice - cost;
        const margin = cost > 0 ? (profit / cost * 100) : 100;
        const isBelow = margin < minMargin;

        return NextResponse.json({
            warning: isBelow,
            message: isBelow
                ? `⚠️ هامش الربح (${margin.toFixed(1)}%) أقل من الحد الأدنى (${minMargin}%)!`
                : `✅ هامش الربح (${margin.toFixed(1)}%) جيد`,
            cost: Math.round(cost),
            salePrice: Math.round(salePrice),
            profit: Math.round(profit),
            margin: Math.round(margin * 100) / 100,
            minMargin
        });
    } catch (error: any) {
        console.error('Margin Check Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Check all drugs in a branch for below-margin items
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || session.user.branchId;

        const settings = await prisma.companySettings.findFirst();
        const minMargin = settings?.minProfitMargin ?? 5;

        const inventories = await prisma.inventory.findMany({
            where: branchId ? { branchId } : {},
            include: { drug: { select: { tradeName: true, barcode: true } } }
        });

        const warnings = inventories
            .map(inv => {
                const margin = inv.cost > 0 ? ((inv.price - inv.cost) / inv.cost * 100) : 100;
                return {
                    drugId: inv.drugId,
                    drugName: inv.drug.tradeName,
                    barcode: inv.drug.barcode,
                    cost: Math.round(inv.cost),
                    price: Math.round(inv.price),
                    profit: Math.round(inv.price - inv.cost),
                    margin: Math.round(margin * 100) / 100,
                    isBelowMin: margin < minMargin
                };
            })
            .filter(w => w.isBelowMin)
            .sort((a, b) => a.margin - b.margin);

        return NextResponse.json({
            warnings,
            totalBelowMin: warnings.length,
            minMargin,
            totalInventory: inventories.length
        });
    } catch (error: any) {
        console.error('Margin GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
