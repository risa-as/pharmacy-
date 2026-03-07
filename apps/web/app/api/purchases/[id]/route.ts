export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

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
        const drugIds = purchase.items.map(i => i.drugId);
        const drugs = await prisma.globalDrug.findMany({
            where: { id: { in: drugIds } },
            select: { id: true, tradeName: true, scientificName: true }
        });
        const drugMap = new Map(drugs.map(d => [d.id, d]));

        const itemsWithNames = purchase.items.map(item => {
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
