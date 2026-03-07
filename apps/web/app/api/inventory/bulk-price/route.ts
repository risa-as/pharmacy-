export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { randomUUID } from "crypto";

// Helper function to round to nearest 250 IQD (ceiling)
function roundToNearest250Ceil(num: number): number {
    if (num <= 0) return 0;
    return Math.ceil(num / 250) * 250;
}

export async function POST(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const body = await req.json();
        const branchId = body.branchId || tenantCtx.user.branchId;

        if (!branchId) {
            return NextResponse.json({ error: "Branch ID required" }, { status: 400 });
        }

        const {
            inventoryIds, // Array of strings
            adjustmentType, // "PERCENTAGE" | "FIXED"
            adjustmentAction, // "INCREASE" | "DECREASE"
            adjustmentValue, // number
            applyRounding // boolean
        } = body;

        if (!inventoryIds || !Array.isArray(inventoryIds) || inventoryIds.length === 0) {
            return NextResponse.json({ error: "يجب اختيار منتج واحد على الأقل" }, { status: 400 });
        }

        if (adjustmentValue <= 0) {
            return NextResponse.json({ error: "قيمة التعديل يجب أن تكون أكبر من صفر" }, { status: 400 });
        }

        // 1. Fetch current items
        const inventories = await prisma.inventory.findMany({
            where: {
                id: { in: inventoryIds },
                branchId: branchId
            },
            include: {
                drug: true
            }
        });

        if (inventories.length === 0) {
            return NextResponse.json({ error: "لم يتم العثور على المنتجات المحددة" }, { status: 404 });
        }

        // 2. Calculate new prices
        const updates = inventories.map((inv: any) => {
            let newPrice = inv.price;

            if (adjustmentType === "PERCENTAGE") {
                const factor = adjustmentValue / 100;
                if (adjustmentAction === "INCREASE") {
                    newPrice = newPrice * (1 + factor);
                } else {
                    newPrice = newPrice * (1 - factor);
                }
            } else if (adjustmentType === "FIXED") {
                if (adjustmentAction === "INCREASE") {
                    newPrice = newPrice + adjustmentValue;
                } else {
                    newPrice = newPrice - adjustmentValue;
                }
            }

            // Ensure price doesn't go below 0
            newPrice = Math.max(0, newPrice);

            // Apply rounding to next 250 if requested
            if (applyRounding) {
                newPrice = roundToNearest250Ceil(newPrice);
            }

            return {
                id: inv.id,
                drugId: inv.drugId,
                oldPrice: inv.price,
                newPrice: newPrice
            };
        });

        // 3. Process database updates in a transaction
        await prisma.$transaction(async (tx) => {
            for (const update of updates) {
                // Skip if price didn't change
                if (update.oldPrice === update.newPrice) continue;

                // Update the inventory record
                await tx.inventory.update({
                    where: { id: update.id },
                    data: { price: update.newPrice }
                });

                // GlobalDrug price update removed because price field only exists on Inventory.

                // Generate Sync Action for Desktop POS
                // Desktop POS currently syncs products via 'CREATE_DRUG' or similar, we will log INVENTORY_UPDATE
                // and send the new price.
                await tx.syncActionLog.create({
                    data: {
                        idempotencyKey: randomUUID(),
                        actionType: 'INVENTORY_UPDATE',
                        branchId: branchId,
                        status: 'PROCESSED',
                        errorMessage: JSON.stringify({
                            inventoryId: update.id,
                            drugId: update.drugId,
                            newPrice: update.newPrice
                        }) // Abusing errorMessage to store payload for sync temporarily, or we could add a payload field.
                        // Note: Since SyncActionLog in web schema doesn't have a payload field, we might need a better way.
                        // For now, Desktop's `sync-from-cloud` might need to just fetch all inventory where updatedAt > lastSync.
                        // We'll rely on timestamps for sync in Desktop POS usually.
                    }
                });
            }
        });

        return NextResponse.json({
            success: true,
            updatedCount: updates.filter((u: any) => u.oldPrice !== u.newPrice).length
        });

    } catch (error: any) {
        console.error("Bulk Price Update error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
