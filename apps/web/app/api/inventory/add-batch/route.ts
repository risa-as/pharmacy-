import { Prisma } from '@prisma/client';
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { sendAndPersistNotification } from "@/app/lib/notifications/notificationTriggers";

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

        const { inventoryId, batchNumber, quantity, expiryDate, branchId, drugId, costPrice, supplierId } = body;

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

            // Auto-generate an 8-char alphanumeric batch number
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const effectiveBatchNumber = batchNumber
                || Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

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
                    supplierId: supplierId ?? null,
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

        // T032 — Low-stock trigger: fire-and-forget after success
        void (async () => {
            try {
                const batches = await prisma.batch.findMany({
                    where: { inventoryId: result.inventory.id },
                    select: { quantity: true },
                });
                const totalQty = batches.reduce((s: any, b: any) => s + b.quantity, 0);
                if (totalQty <= result.inventory.minStock) {
                    const drug = await prisma.inventory.findUnique({
                        where: { id: result.inventory.id },
                        include: { drug: { select: { tradeName: true } } },
                    });
                    await sendAndPersistNotification({
                        type: 'LOW_STOCK',
                        title: 'تحذير: نقص مخزون',
                        body: `${drug?.drug?.tradeName ?? 'دواء'}: الكمية الحالية (${totalQty}) أقل من أو تساوي الحد الأدنى (${result.inventory.minStock})`,
                        branchId: result.inventory.branchId,
                    });
                }
            } catch (triggerErr) {
                console.error('[add-batch] Low-stock trigger failed:', triggerErr);
            }
        })();

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
