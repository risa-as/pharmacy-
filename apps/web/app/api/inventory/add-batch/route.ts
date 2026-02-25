import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type AckStatus = "processed" | "duplicate" | "noop";

function readIdempotencyKey(req: Request, body: any): string {
    const fromHeader = String(req.headers.get("x-idempotency-key") || "").trim();
    const fromBody = String(body?.clientActionId || "").trim();
    return (fromHeader || fromBody).slice(0, 120);
}

function sanitizeBatchKey(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
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

        if (idempotencyKey) {
            const existingLog = await prisma.syncActionLog.findUnique({
                where: { idempotencyKey }
            });
            if (existingLog) {
                console.log(`[Add-Batch API] Duplicate request detected. Key: ${idempotencyKey}`);
                return NextResponse.json({
                    success: true,
                    message: 'Duplicate batch ignored safely',
                    ack: makeAck("duplicate", idempotencyKey)
                });
            }
        }

        const { inventoryId, batchNumber, quantity, expiryDate, branchId, drugId, costPrice } = body;

        if (!inventoryId && !drugId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Missing required fields (inventoryId or drugId)",
                    ack: makeAck("noop", idempotencyKey),
                },
                { status: 400 }
            );
        }

        const parsedQuantity = Number.parseInt(String(quantity ?? 0), 10) || 0;
        if (parsedQuantity <= 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Quantity must be greater than 0",
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

            // Create batch number from idempotency key or provided value
            const effectiveBatchNumber = batchNumber
                || (idempotencyKey ? `SYNC-${sanitizeBatchKey(idempotencyKey)}` : `BATCH-${Date.now()}`);

            // Remove idempotency checks on batch number as SyncActionLog handles it

            // Create the batch
            await tx.batch.create({
                data: {
                    inventoryId: inventory.id,
                    quantity: parsedQuantity,
                    expiryDate: expiryDate
                        ? new Date(expiryDate)
                        : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                    batchNumber: effectiveBatchNumber,
                    costPrice: Number(costPrice) || 0,
                }
            });

            if (idempotencyKey) {
                await tx.syncActionLog.create({
                    data: {
                        idempotencyKey,
                        actionType: 'ADD_BATCH',
                        branchId: inventory.branchId,
                        status: 'PROCESSED'
                    }
                });
            }

            return { inventory, ackStatus: "processed" as AckStatus };
        });

        return NextResponse.json({
            success: true,
            data: result.inventory,
            ack: makeAck(result.ackStatus, idempotencyKey),
        });
    } catch (error: any) {
        console.error("Add batch failed:", error);
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
