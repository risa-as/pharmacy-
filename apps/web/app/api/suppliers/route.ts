export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { checkFeatureAccess } from "@/app/lib/saas-guards";

export async function GET(req: NextRequest) {
    try {
        let organizationId: string | null = null;

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
            organizationId = branch.organizationId;
        } else {
            // Supplier model uses organizationId — resolve from tenantCtx
            if (tenantCtx.organizationId) {
                organizationId = tenantCtx.organizationId;
            } else if (tenantCtx.user.branchId) {
                // Staff user: look up org via their branch
                const branch = await prisma.branch.findUnique({
                    where: { id: tenantCtx.user.branchId },
                    select: { organizationId: true },
                });
                organizationId = branch?.organizationId ?? null;
            }
            // SUPER_ADMIN: no filter (organizationId stays null → fetch all, bypasses gate)
        }

        // Fix #6: Feature Gate check AFTER resolving organizationId, but
        // BEFORE any data query — prevent access even for Desktop app callers.
        if (organizationId) {
            const access = await checkFeatureAccess(organizationId, 'supplierManagement');
            if (!access.allowed) {
                return NextResponse.json(
                    {
                        error: 'هذه الميزة متاحة في الباقة الاحترافية فقط.',
                        code: 'FEATURE_NOT_IN_PLAN',
                        requiredPlan: 'PROFESSIONAL'
                    },
                    { status: 403 }
                );
            }
        }

        const suppliers = await prisma.supplier.findMany({
            where: organizationId ? { organizationId } : {},
            select: { id: true, name: true, phone: true },
            orderBy: { name: 'asc' }
        });

        const response = NextResponse.json(suppliers);
        response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        return response;
    } catch (error) {
        console.error("Suppliers API Error:", error);
        return NextResponse.json({ message: "Failed to fetch suppliers" }, { status: 500 });
    }
}
