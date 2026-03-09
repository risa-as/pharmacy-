export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
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
                console.log(`[Add-To-Branch API] Duplicate request detected. Key: ${idempotencyKey}`);
                return NextResponse.json({
                    success: true,
                    message: 'Duplicate branch add ignored safely',
                    ack: makeAck("duplicate", idempotencyKey)
                });
            }
        }

        const { id, drugId, branchId, price, cost, minStock, maxStock, quantity, expiryDate } = body;

        if (!drugId || !branchId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Missing required fields (DrugId, BranchId)",
                    ack: makeAck("noop", idempotencyKey),
                },
                { status: 400 }
            );
        }

        const parsedQuantity = Number.parseInt(String(quantity ?? 0), 10) || 0;
        const parsedPrice = Number.parseFloat(String(price ?? 0)) || 0;
        const parsedCost = Number.parseFloat(String(cost ?? 0)) || 0;
        const parsedMin = Number.parseInt(String(minStock ?? 0), 10) || 0;
        const parsedMax = Number.parseInt(String(maxStock ?? 100), 10) || 100;

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            let inventory;
            const existingInventory = id
                ? await tx.inventory.findUnique({ where: { id } })
                : await tx.inventory.findFirst({ where: { branchId, drugId } });

            if (existingInventory) {
                inventory = await tx.inventory.update({
                    where: { id: existingInventory.id },
                    data: {
                        price: parsedPrice || existingInventory.price,
                        cost: parsedCost || existingInventory.cost,
                        minStock: parsedMin || existingInventory.minStock,
                        maxStock: parsedMax || existingInventory.maxStock,
                    }
                });
            } else {
                inventory = await tx.inventory.create({
                    data: {
                        id: id || undefined,
                        branchId,
                        drugId,
                        price: parsedPrice,
                        cost: parsedCost,
                        minStock: parsedMin,
                        maxStock: parsedMax,
                    }
                });
            }

            let ackStatus: AckStatus = parsedQuantity > 0 ? "processed" : "noop";
            if (parsedQuantity > 0) {
                const batchNumber = idempotencyKey
                    ? `SYNC-${sanitizeBatchKey(idempotencyKey)}`
                    : "INIT-" + new Date().getTime().toString().slice(-6);

                await tx.batch.create({
                    data: {
                        inventoryId: inventory.id,
                        quantity: parsedQuantity,
                        expiryDate: expiryDate
                            ? new Date(expiryDate)
                            : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                        batchNumber,
                        costPrice: parsedCost,
                    }
                });
            }

            if (idempotencyKey) {
                await tx.syncActionLog.create({
                    data: {
                        idempotencyKey,
                        actionType: 'ADD_TO_BRANCH',
                        branchId,
                        status: 'PROCESSED'
                    }
                });
            }

            return { inventory, ackStatus };
        });

        return NextResponse.json({
            success: true,
            data: result.inventory,
            ack: makeAck(result.ackStatus, idempotencyKey),
        });
    } catch (error: any) {
        console.error("Add to inventory failed:", error);
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
