export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from "@/app/lib/sync-auth";

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
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const body = await req.json();
        const idempotencyKey = readIdempotencyKey(req, body);

        if (idempotencyKey) {
            const existingLog = await prisma.syncActionLog.findUnique({
                where: { idempotencyKey }
            });
            if (existingLog) {
                console.log(`[Create-Quick API] Duplicate request detected. Key: ${idempotencyKey}`);
                return NextResponse.json({
                    success: true,
                    message: 'Duplicate creation ignored safely',
                    ack: makeAck("duplicate", idempotencyKey)
                });
            }
        }

        const {
            id,
            barcode,
            tradeName,
            scientificName,
            origin,
            branchId,
            price,
            cost,
            costPrice,
            minStock,
            maxStock,
            quantity,
            expiryDate,
            inventoryId,
            supplierId,
            isQuickSale,
        } = body;

        if (!barcode || !tradeName || !branchId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Missing required fields (Barcode, Name, Branch)",
                    ack: makeAck("noop", idempotencyKey),
                },
                { status: 400 }
            );
        }

        const parsedQuantity = Number.parseInt(String(quantity ?? 0), 10) || 0;
        const parsedPrice = Number.parseFloat(String(price ?? 0)) || 0;
        const parsedCost = Number.parseFloat(String(cost ?? costPrice ?? 0)) || 0;
        const parsedMin = Number.parseInt(String(minStock ?? 0), 10) || 0;
        const parsedMax = Number.parseInt(String(maxStock ?? 100), 10) || 100;

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const branch = await tx.branch.findUnique({
                where: { id: branchId },
                select: { id: true, organizationId: true },
            });
            if (!branch) throw new Error("Branch not found");

            // Resolve the org: prefer syncUser's org, fall back to branch's org
            const organizationId = syncUser.organizationId ?? branch.organizationId ?? null;

            let drug = await tx.globalDrug.findFirst({
                where: id ? { id } : { barcode }
            });

            if (drug) {
                // Global drugs (organizationId: null) are read-only — use as-is without modifying.
                // Only update drug details if it belongs to this org.
                if (drug.organizationId === organizationId && organizationId) {
                    drug = await tx.globalDrug.update({
                        where: { id: drug.id },
                        data: {
                            tradeName,
                            scientificName: scientificName || tradeName,
                            origin: origin || drug.origin || "unknown",
                        }
                    });
                }
                // else: global drug — skip update, just use the existing record
            } else {
                drug = await tx.globalDrug.create({
                    data: {
                        id: id || undefined,
                        barcode,
                        tradeName,
                        scientificName: scientificName || tradeName,
                        origin: origin || "unknown",
                        isQuickSale: isQuickSale === true,
                        organizationId,
                    }
                });
            }

            let inventory = inventoryId
                ? await tx.inventory.findUnique({ where: { id: inventoryId } })
                : null;

            if (!inventory) {
                inventory = await tx.inventory.findFirst({
                    where: {
                        drugId: drug.id,
                        branchId: branch.id
                    }
                });
            }

            if (inventory) {
                inventory = await tx.inventory.update({
                    where: { id: inventory.id },
                    data: {
                        price: parsedPrice,
                        cost: parsedCost,
                        minStock: parsedMin,
                        maxStock: parsedMax,
                    }
                });
            } else {
                inventory = await tx.inventory.create({
                    data: {
                        id: inventoryId || undefined,
                        branchId: branch.id,
                        drugId: drug.id,
                        price: parsedPrice,
                        cost: parsedCost,
                        minStock: parsedMin,
                        maxStock: parsedMax,
                    }
                });
            }

            let ackStatus: AckStatus = parsedQuantity > 0 ? "processed" : "noop";
            if (parsedQuantity > 0) {
                const batchChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                const batchNumber = Array.from({ length: 8 }, () => batchChars[Math.floor(Math.random() * batchChars.length)]).join('');

                await tx.batch.create({
                    data: {
                        inventoryId: inventory.id,
                        quantity: parsedQuantity,
                        expiryDate: expiryDate
                            ? new Date(expiryDate)
                            : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                        batchNumber,
                        costPrice: parsedCost,
                        supplierId: supplierId ?? null,
                    }
                });
            }

            if (idempotencyKey) {
                await tx.syncActionLog.create({
                    data: {
                        idempotencyKey,
                        actionType: 'CREATE_DRUG',
                        branchId,
                        status: 'PROCESSED'
                    }
                });
            }

            return { drug, inventory, ackStatus };
        });

        return NextResponse.json({
            success: true,
            data: {
                drug: result.drug,
                inventory: result.inventory,
            },
            ack: makeAck(result.ackStatus, idempotencyKey),
        });
    } catch (error: any) {
        console.error("Quick create failed:", error);
        return NextResponse.json(
            {
                success: false,
                message: "Creation failed: " + error.message,
                ack: makeAck("noop", ""),
            },
            { status: 500 }
        );
    }
}
