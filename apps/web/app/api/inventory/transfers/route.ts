import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function POST(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
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

        // 1. Transaction to ensure Atomicity (Either it all succeeds, or none)
        const result = await prisma.$transaction(async (tx) => {

            // Generate the transfer record
            const transfer = await tx.transfer.create({
                data: {
                    fromBranchId,
                    toBranchId,
                    status: 'IN_TRANSIT', // Immediately marked as sent
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
                include: {
                    items: true
                }
            });

            // 2. Deduct inventory from the Sender (fromBranchId)
            for (const item of items) {
                // Find specifically this batch in the sender's inventory
                const batch = await tx.batch.findFirst({
                    where: {
                        inventory: {
                            branchId: fromBranchId,
                            drugId: item.drugId
                        },
                        batchNumber: item.batchNumber
                    }
                });

                if (!batch || batch.quantity < item.quantity) {
                    throw new Error(`Insufficient quantity for drug ${item.drugId} batch ${item.batchNumber}`);
                }

                // Decrement batch quantity
                await tx.batch.update({
                    where: { id: batch.id },
                    data: { quantity: { decrement: item.quantity } }
                });
            }

            return transfer;
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
        const branchId = tenantCtx.user.branchId;

        if (!branchId) {
            return NextResponse.json({ error: "Branch not assigned to user" }, { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'all'; // 'incoming', 'outgoing', 'all'

        let whereClause: any = {};

        if (type === 'incoming') {
            whereClause = { toBranchId: branchId };
        } else if (type === 'outgoing') {
            whereClause = { fromBranchId: branchId };
        } else {
            whereClause = {
                OR: [
                    { fromBranchId: branchId },
                    { toBranchId: branchId }
                ]
            };
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
