export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { logAudit } from "@/app/lib/audit";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const purchase = await prisma.purchase.findFirst({
            where: { id: params.id, ...tenantBranchWhere },
        });

        if (!purchase) {
            return NextResponse.json({ message: "Purchase not found" }, { status: 404 });
        }
        if (purchase.status === 'COMPLETED' || purchase.status === 'RECEIVED') {
            return NextResponse.json({ message: "لا يمكن حذف الطلبات المكتملة" }, { status: 400 });
        }

        await prisma.purchaseItem.deleteMany({ where: { purchaseId: params.id } });
        await prisma.purchase.delete({ where: { id: params.id } });

        void logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'DELETE',
            entity: 'PURCHASE',
            entityId: params.id,
            details: JSON.stringify({ status: purchase.status }),
            branchId: purchase.branchId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete Purchase API Error:", error);
        return NextResponse.json({ message: "Failed to delete purchase" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const body = await req.json();
        if (body.action !== 'cancel') {
            return NextResponse.json({ message: "Invalid action" }, { status: 400 });
        }

        const purchase = await prisma.purchase.findFirst({
            where: { id: params.id, ...tenantBranchWhere },
        });

        if (!purchase) {
            return NextResponse.json({ message: "Purchase not found" }, { status: 404 });
        }
        if (purchase.status !== 'PENDING') {
            return NextResponse.json({ message: "يمكن إلغاء الطلبات المعلقة فقط" }, { status: 400 });
        }

        await prisma.purchase.update({
            where: { id: params.id },
            data: { status: 'CANCELLED' },
        });

        void logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'PURCHASE',
            entityId: params.id,
            details: JSON.stringify({ status: 'CANCELLED' }),
            branchId: purchase.branchId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Cancel Purchase API Error:", error);
        return NextResponse.json({ message: "Failed to cancel purchase" }, { status: 500 });
    }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
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

        const itemsWithNames = purchase.items.map((item: any) => {
            const drug = drugMap.get(item.drugId);
            return {
                ...item,
                drugName: drug?.tradeName || 'Unknown',
                scientificName: drug?.scientificName
            };
        });

        return NextResponse.json({
            ...purchase,
            items: itemsWithNames
        });

    } catch (error) {
        console.error("Purchase Details API Error:", error);
        return NextResponse.json({ message: "Failed to fetch purchase details" }, { status: 500 });
    }
}
