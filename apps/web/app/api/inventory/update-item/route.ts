export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser, isBranchInSyncScope } from "@/app/lib/sync-auth";
import { logAudit, resolveUserName } from "@/app/lib/audit";

type AckStatus = "processed" | "duplicate" | "noop";

class ForbiddenError extends Error {}

function readIdempotencyKey(req: Request, body: any): string {
    const fromHeader = String(req.headers.get("x-idempotency-key") || "").trim();
    const fromBody = String(body?.clientActionId || "").trim();
    return (fromHeader || fromBody).slice(0, 120);
}

function makeAck(status: AckStatus, idempotencyKey: string) {
    return {
        status,
        idempotencyKey: idempotencyKey || null,
        serverTime: new Date().toISOString(),
    };
}

export async function POST(req: Request) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const body = await req.json();
        const idempotencyKey = readIdempotencyKey(req, body);

        const { inventoryId, drugId, branchId, price, costPrice, minStock, maxStock } = body;

        if (!inventoryId && (!drugId || !branchId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Missing required fields (inventoryId or drugId+branchId)",
                    ack: makeAck("noop", idempotencyKey),
                },
                { status: 400 }
            );
        }

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Find the inventory record
            let inventory;
            if (inventoryId) {
                inventory = await tx.inventory.findUnique({ where: { id: inventoryId } });
            }
            if (!inventory && drugId && branchId) {
                inventory = await tx.inventory.findFirst({
                    where: { drugId, branchId }
                });
            }

            if (!inventory) {
                throw new Error("Inventory record not found");
            }

            // Tenant isolation: only mutate records inside the caller's scope.
            if (!(await isBranchInSyncScope(syncUser, inventory.branchId))) {
                throw new ForbiddenError();
            }

            // Build update data — only update fields that were provided
            const updateData: any = {};
            if (price !== undefined && price !== null) {
                const parsed = Number.parseFloat(String(price));
                if (!Number.isNaN(parsed)) updateData.price = parsed;
            }
            if (costPrice !== undefined && costPrice !== null) {
                const parsed = Number.parseFloat(String(costPrice));
                if (!Number.isNaN(parsed)) updateData.cost = parsed;
            }
            if (minStock !== undefined && minStock !== null) {
                const parsed = Number.parseInt(String(minStock), 10);
                if (!Number.isNaN(parsed)) updateData.minStock = parsed;
            }
            if (maxStock !== undefined && maxStock !== null) {
                const parsed = Number.parseInt(String(maxStock), 10);
                if (!Number.isNaN(parsed)) updateData.maxStock = parsed;
            }

            // Update inventory
            if (Object.keys(updateData).length > 0) {
                inventory = await tx.inventory.update({
                    where: { id: inventory.id },
                    data: updateData
                });
            }
            // GlobalDrug price update removed because web schema does not have price on GlobalDrug

            return { inventory, ackStatus: "processed" as AckStatus, changed: updateData };
        });

        // Audit the price/stock-level edit, attributed to the acting user.
        if (Object.keys(result.changed).length > 0) {
            await logAudit({
                userId: syncUser.id,
                userName: syncUser.name ?? await resolveUserName(syncUser.id),
                action: "UPDATE",
                entity: "INVENTORY",
                entityId: result.inventory.id,
                details: JSON.stringify({ changes: result.changed, source: "desktop-sync" }),
                branchId: result.inventory.branchId,
            });
        }

        return NextResponse.json({
            success: true,
            data: result.inventory,
            ack: makeAck(result.ackStatus, idempotencyKey),
        });
    } catch (error: any) {
        if (error instanceof ForbiddenError) {
            return NextResponse.json(
                { success: false, message: "Forbidden", ack: makeAck("noop", "") },
                { status: 403 }
            );
        }
        console.error("Update inventory item failed:", error);
        return NextResponse.json(
            {
                success: false,
                message: "Failed to update inventory item",
                ack: makeAck("noop", ""),
            },
            { status: 500 }
        );
    }
}
