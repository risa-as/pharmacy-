import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function GET(req: NextRequest) {
    try {
        let where: Record<string, any> = {};

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) {
            // Desktop app: no session — resolve org from branchId query param
            const branchId = req.nextUrl.searchParams.get('branchId');
            if (!branchId) return tenantCtx; // genuine 401

            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: { organizationId: true },
            });
            if (!branch) return NextResponse.json({ message: 'Branch not found' }, { status: 403 });

            where = { organizationId: branch.organizationId };
        } else {
            where = tenantCtx.tenantWhere;
        }

        const suppliers = await prisma.supplier.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true
            },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json(suppliers);
    } catch (error) {
        console.error("Suppliers API Error:", error);
        return NextResponse.json({ message: "Failed to fetch suppliers" }, { status: 500 });
    }
}
