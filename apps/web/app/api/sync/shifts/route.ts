export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { z } from "zod";


const SyncShiftSchema = z.object({
    id: z.string(),
    userId: z.string(),
    branchId: z.string(),
    safeId: z.string().nullable().optional(),
    startTime: z.string().or(z.date()),
    endTime: z.string().or(z.date()).nullable().optional(),
    duration: z.number().default(0),
    startingCash: z.number().default(0),
    expectedCash: z.number().default(0),
    actualCash: z.number().nullable().optional(),
    status: z.string().default("OPEN"),
    createdAt: z.string().or(z.date()),
    updatedAt: z.string().or(z.date()),
});

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    shifts: z.array(SyncShiftSchema)
});

export async function POST(req: NextRequest) {
    try {
        const idempotencyKey = req.headers.get('x-idempotency-key');
        if (!idempotencyKey) {
            return NextResponse.json({ error: "Missing x-idempotency-key header" }, { status: 400 });
        }

        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, shifts } = result.data;

        // Check Idempotency
        const existingLog = await prisma.syncActionLog.findUnique({
            where: { idempotencyKey }
        });

        if (existingLog) {
            if (existingLog.status === "PROCESSED") {
                return NextResponse.json({ success: true, message: "Already processed", ack: { status: 'processed', idempotencyKey } });
            }
        }

        const processedIds: string[] = [];

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            for (const shift of shifts) {
                const existing = await tx.shift.findUnique({ where: { id: shift.id } });

                if (existing) {
                    // Update existing
                    await tx.shift.update({
                        where: { id: shift.id },
                        data: {
                            endTime: shift.endTime ? new Date(shift.endTime) : null,
                            duration: shift.duration,
                            expectedCash: shift.expectedCash,
                            actualCash: shift.actualCash,
                            status: shift.status,
                            updatedAt: shift.updatedAt ? new Date(shift.updatedAt) : new Date()
                        }
                    });
                } else {
                    // Create new
                    await tx.shift.create({
                        data: {
                            id: shift.id,
                            userId: shift.userId,
                            branchId: shift.branchId,
                            safeId: shift.safeId,
                            startTime: new Date(shift.startTime),
                            endTime: shift.endTime ? new Date(shift.endTime) : null,
                            duration: shift.duration,
                            startingCash: shift.startingCash,
                            expectedCash: shift.expectedCash,
                            actualCash: shift.actualCash,
                            status: shift.status,
                            createdAt: new Date(shift.createdAt),
                            updatedAt: shift.updatedAt ? new Date(shift.updatedAt) : new Date()
                        }
                    });
                }
                processedIds.push(shift.id);
            }

            // Log the action
            await tx.syncActionLog.upsert({
                where: { idempotencyKey },
                update: { status: "PROCESSED", updatedAt: new Date() },
                create: {
                    idempotencyKey,
                    actionType: "SYNC_SHIFTS",
                    branchId,
                    status: "PROCESSED"
                }
            });
        });

        return NextResponse.json({ success: true, syncedIds: processedIds, ack: { status: 'processed', idempotencyKey } });

    } catch (error: any) {
        console.error("Shift sync error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
