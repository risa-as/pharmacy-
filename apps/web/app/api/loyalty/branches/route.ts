export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";

// GET: list branches with their loyaltyEnabled status
export async function GET() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.organizationId) {
        return NextResponse.json({ error: "No organization assigned" }, { status: 400 });
    }

    try {
        const branches = await prisma.branch.findMany({
            where: tenantCtx.branchModelWhere,
            select: { id: true, name: true, loyaltyEnabled: true },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json(branches);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 });
    }
}

// PATCH: toggle loyaltyEnabled for a single branch
// Body: { branchId, loyaltyEnabled }
export async function PATCH(request: Request) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.organizationId) {
        return NextResponse.json({ error: "No organization assigned" }, { status: 400 });
    }

    try {
        const { branchId, loyaltyEnabled } = await request.json();

        if (!branchId || typeof loyaltyEnabled !== 'boolean') {
            return NextResponse.json({ error: "branchId and loyaltyEnabled required" }, { status: 400 });
        }

        // Verify the branch belongs to this organization
        const branch = await prisma.branch.findFirst({
            where: { id: branchId, ...tenantCtx.branchModelWhere },
            select: { id: true },
        });

        if (!branch) {
            return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        }

        const updated = await prisma.branch.update({
            where: { id: branchId },
            data: { loyaltyEnabled },
            select: { id: true, name: true, loyaltyEnabled: true },
        });

        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update branch" }, { status: 500 });
    }
}
