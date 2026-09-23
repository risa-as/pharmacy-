export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { logAudit } from "@/app/lib/audit";

import { cancelPurchase, deletePurchase, getPurchaseDetails } from '@/app/lib/actions/purchase-actions';
async function mutate(req: Request, props: { params: Promise<{ id: string }> }, remove: boolean) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.userPermissions.canCreatePurchase) return NextResponse.json({ message: 'ليس لديك صلاحية إدارة المشتريات.' }, {status:403});
    try {
        if (!remove && (await req.json()).action !== 'cancel') return NextResponse.json({message:'إجراء غير صالح'}, {status:400});
        const { id } = await props.params;
        const result = await (remove ? deletePurchase(id) : cancelPurchase(id));
        return NextResponse.json(result.success ? result : { ...result, message: result.error }, {status: result.success ? 200 : 409});
    } catch (error) { return NextResponse.json({message:error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء'}, {status:409}); }
}
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) { return mutate(req, props, true); }
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) { return mutate(req, props, false); }

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canViewSuppliers) return NextResponse.json({message:'ليس لديك صلاحية عرض المشتريات'}, {status:403});
        const { tenantBranchWhere } = tenantCtx;

        const { id } = params;

        const purchase = await prisma.purchase.findFirst({
            where: { id, ...tenantBranchWhere },
            include: {
                supplier: true,
                items: true,
                branch: {
                    select: { name: true }
                }
            }
        });

        if (!purchase) {
            return NextResponse.json({ message: "Purchase not found" }, { status: 404 });
        }

        // Fetch drug names
        const drugIds = purchase.items.map((i: any) => i.drugId);
        const drugs = await prisma.globalDrug.findMany({
            where: { id: { in: drugIds } },
            select: { id: true, tradeName: true, scientificName: true }
        });
        const drugMap = new Map<string, any>(drugs.map((d: any) => [d.id, d]));

        // Last purchase price per drug in the receiving branch (newest paid batch,
        // else the stock cost) — suggested when prices are confirmed at receipt.
        const [lastBatches, inventories] = await Promise.all([
            prisma.batch.findMany({
                where: { costPrice: { gt: 0 }, inventory: { branchId: purchase.branchId, drugId: { in: drugIds } } },
                orderBy: { createdAt: 'desc' },
                distinct: ['inventoryId'],
                select: { costPrice: true, inventory: { select: { drugId: true } } },
            }),
            prisma.inventory.findMany({
                where: { branchId: purchase.branchId, drugId: { in: drugIds } },
                select: { drugId: true, cost: true },
            }),
        ]);
        const lastCostByDrug = new Map<string, number>();
        for (const inv of inventories) if (inv.cost > 0) lastCostByDrug.set(inv.drugId, inv.cost);
        for (const b of lastBatches) lastCostByDrug.set(b.inventory.drugId, b.costPrice);

        const prefilled = await getPurchaseDetails(id);
        const itemsWithNames = purchase.items.map((item: any) => {
            const drug = drugMap.get(item.drugId);
            return {
                ...item,
                drugName: drug?.tradeName || 'Unknown',
                scientificName: drug?.scientificName,
                lastCost: lastCostByDrug.get(item.drugId) ?? null,
                ...prefilled?.items.find((line: any) => line.id === item.id),
            };
        });

        const legacyOrder = !purchase.warehouseOrderId && purchase.supplier.warehouseId ? await prisma.warehouseOrderEvent.findFirst({where:{type:'APPROVED',payload:{path:['purchaseId'],equals:id}},select:{orderId:true}}) : null;
        const linkedOrderId = purchase.warehouseOrderId || legacyOrder?.orderId || null;
        const linkedOrder = linkedOrderId ? await prisma.warehouseOrder.findFirst({
            where: { AND: [tenantBranchWhere, { id: linkedOrderId }] },
            select: { status: true, orderNumber: true },
        }) : null;
        const receivedBatches = purchase.status === 'COMPLETED' ? await prisma.batch.findMany({
            where: { purchaseItemId: { in: purchase.items.map(item => item.id) }, inventory: { branchId: purchase.branchId } },
            select: { id: true, purchaseItemId: true, batchNumber: true, expiryDate: true, quantity: true, costPrice: true },
        }) : [];
        return NextResponse.json({
            ...purchase,
            receivedBatches,
            warehouseOrderId: linkedOrderId,
            warehouseOrderStatus: linkedOrder?.status ?? null,
            warehouseOrderNumber: linkedOrder?.orderNumber ?? null,
            items: itemsWithNames
        });

    } catch (error) {
        console.error("Purchase Details API Error:", error);
        return NextResponse.json({ message: "Failed to fetch purchase details" }, { status: 500 });
    }
}
