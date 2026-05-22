import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { checkFeatureAccess } from "@/app/lib/saas-guards";
import { logAudit } from "@/app/lib/audit";

async function checkTransferAccess(tenantCtx: any) {
    if (!tenantCtx.organizationId) return null; // SUPER_ADMIN — allow
    const access = await checkFeatureAccess(tenantCtx.organizationId, 'interBranchTransfers');
    if (!access.allowed) {
        return NextResponse.json({
            error: 'هذه الميزة متاحة في باقة الشركات فقط.',
            code: 'FEATURE_NOT_IN_PLAN',
            requiredPlan: 'ENTERPRISE'
        }, { status: 403 });
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canTransferStock) {
            return NextResponse.json({ error: "ليس لديك صلاحية لتحويل المخزون بين الأفرع." }, { status: 403 });
        }

        const guard = await checkTransferAccess(tenantCtx);
        if (guard) return guard;

        const fromBranchId = tenantCtx.user.branchId;

        if (!fromBranchId) {
            return NextResponse.json({ error: "Branch not assigned to user" }, { status: 400 });
        }

        const data = await req.json();
        const { toBranchId, notes, items } = data;

        if (!toBranchId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "Invalid transfer data" }, { status: 400 });
        }

        if (fromBranchId === toBranchId) {
            return NextResponse.json({ error: "Cannot transfer to the same branch" }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const transfer = await tx.transfer.create({
                data: {
                    fromBranchId,
                    toBranchId,
                    status: 'IN_TRANSIT',
                    notes: notes || null,
                    items: {
                        create: items.map((item: any) => ({
                            drugId: item.drugId,
                            batchNumber: item.batchNumber,
                            expiryDate: new Date(item.expiryDate),
                            quantity: item.quantity,
                            costPrice: item.costPrice || 0
                        }))
                    }
                },
                include: { items: true }
            });

            for (const item of items) {
                const batch = await tx.batch.findFirst({
                    where: {
                        inventory: { branchId: fromBranchId, drugId: item.drugId },
                        batchNumber: item.batchNumber
                    }
                });

                if (!batch || batch.quantity < item.quantity) {
                    throw new Error(`Insufficient quantity for drug ${item.drugId} batch ${item.batchNumber}`);
                }

                await tx.batch.update({
                    where: { id: batch.id },
                    data: { quantity: { decrement: item.quantity } }
                });
            }

            return transfer;
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'TRANSFER',
            entityId: result.id,
            details: JSON.stringify({ fromBranchId, toBranchId, itemCount: items.length }),
            branchId: fromBranchId,
        });

        return NextResponse.json({ success: true, transfer: result });

    } catch (error: any) {
        console.error("Transfer creation error:", error);
        return NextResponse.json({ error: error.message || "Failed to create transfer" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const guard = await checkTransferAccess(tenantCtx);
        if (guard) return guard;

        const branchId = tenantCtx.user.branchId;

        if (!branchId) {
            return NextResponse.json({ error: "Branch not assigned to user" }, { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'all';

        let whereClause: any = {};

        if (type === 'incoming') {
            whereClause = { toBranchId: branchId };
        } else if (type === 'outgoing') {
            whereClause = { fromBranchId: branchId };
        } else {
            whereClause = { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] };
        }

        const transfers = await prisma.transfer.findMany({
            where: whereClause,
            include: {
                fromBranch: { select: { name: true } },
                toBranch: { select: { name: true } },
                items: {
                    include: {
                        drug: { select: { tradeName: true, barcode: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ transfers });

    } catch (error) {
        console.error("Error fetching transfers:", error);
        return NextResponse.json({ error: "Failed to fetch transfers" }, { status: 500 });
    }
}
