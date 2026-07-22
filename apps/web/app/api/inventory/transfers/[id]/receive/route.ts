import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { logAudit } from "@/app/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const transferId = params.id;
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const branchId = tenantCtx.user.branchId; // Expecting the Receiver's Branch ID

        if (!branchId) {
            return NextResponse.json({ error: "Branch not assigned to user" }, { status: 400 });
        }

        // Fetch the transfer
        const transfer = await prisma.transfer.findUnique({
            where: { id: transferId },
            include: { items: true }
        });

        if (!transfer) {
            return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
        }

        if (transfer.toBranchId !== branchId) {
            return NextResponse.json({ error: "A transfer can only be received by its destination branch" }, { status: 403 });
        }

        if (transfer.status === 'COMPLETED') {
            return NextResponse.json({ error: "Transfer has already been received" }, { status: 400 });
        }

        // 1. Transaction to Atomically receive goods
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Update Transfer Status
            await tx.transfer.update({
                where: { id: transferId },
                data: { status: 'COMPLETED' }
            });

            // 2. Add inventory to the Receiver (toBranchId)
            for (const item of transfer.items) {

                // Find or Create Global Inventory link for the destination branch
                let inventory = await tx.inventory.findFirst({
                    where: { branchId, drugId: item.drugId }
                });

                if (!inventory) {
                    inventory = await tx.inventory.create({
                        data: {
                            branchId,
                            drugId: item.drugId,
                            cost: item.costPrice || 0,
                            price: item.costPrice || 0 // Default price to cost price initially
                        }
                    });
                }

                // Find or Create specific Batch in destination branch
                const existingBatch = await tx.batch.findFirst({
                    where: {
                        inventoryId: inventory.id,
                        batchNumber: item.batchNumber
                    }
                });

                if (existingBatch) {
                    // Transfer-in is new stock arriving, not a return of consumed stock —
                    // bump initialQuantity too so consumed (initial - quantity) stays correct.
                    await tx.batch.update({
                        where: { id: existingBatch.id },
                        data: {
                            quantity: { increment: item.quantity },
                            initialQuantity: { increment: item.quantity }
                        }
                    });
                } else {
                    await tx.batch.create({
                        data: {
                            inventoryId: inventory.id,
                            batchNumber: item.batchNumber,
                            expiryDate: item.expiryDate,
                            quantity: item.quantity,
                            initialQuantity: item.quantity,
                            costPrice: item.costPrice
                        }
                    });
                }
            }
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'TRANSFER',
            entityId: transferId,
            details: JSON.stringify({ event: 'received', fromBranchId: transfer.fromBranchId, toBranchId: branchId }),
            branchId,
        });

        return NextResponse.json({ success: true, message: "Transfer received and inventory updated" });

    } catch (error: any) {
        console.error("Receive transfer error:", error);
        return NextResponse.json({ error: error.message || "Failed to receive transfer" }, { status: 500 });
    }
}
