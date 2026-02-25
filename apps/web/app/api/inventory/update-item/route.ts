import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type AckStatus = "processed" | "duplicate" | "noop";

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

        const result = await prisma.$transaction(async (tx) => {
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

            // Build update data — only update fields that were provided
            const updateData: any = {};
            if (price !== undefined && price !== null) {
                updateData.price = Number.parseFloat(String(price)) || inventory.price;
            }
            if (costPrice !== undefined && costPrice !== null) {
                updateData.cost = Number.parseFloat(String(costPrice)) || inventory.cost;
            }
            if (minStock !== undefined && minStock !== null) {
                updateData.minStock = Number.parseInt(String(minStock), 10) || inventory.minStock;
            }
            if (maxStock !== undefined && maxStock !== null) {
                updateData.maxStock = Number.parseInt(String(maxStock), 10) || inventory.maxStock;
            }

            // Update inventory
            if (Object.keys(updateData).length > 0) {
                inventory = await tx.inventory.update({
                    where: { id: inventory.id },
                    data: updateData
                });
            }
            // GlobalDrug price update removed because web schema does not have price on GlobalDrug

            return { inventory, ackStatus: "processed" as AckStatus };
        });

        return NextResponse.json({
            success: true,
            data: result.inventory,
            ack: makeAck(result.ackStatus, idempotencyKey),
        });
    } catch (error: any) {
        console.error("Update inventory item failed:", error);
        return NextResponse.json(
            {
                success: false,
                message: "Failed: " + error.message,
                ack: makeAck("noop", ""),
            },
            { status: 500 }
        );
    }
}
