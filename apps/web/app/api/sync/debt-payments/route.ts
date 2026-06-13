export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';
import { logAudit, resolveUserName } from '@/app/lib/audit';

async function validateBranchAccess(syncUser: any, branchId: string): Promise<NextResponse | null> {
    const userRole = syncUser.role;
    const userBranchId = syncUser.branchId;
    const userOrgId = syncUser.organizationId;

    if (userRole === 'SUPER_ADMIN') return null;

    const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { organizationId: true }
    });
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    if (userRole === 'ADMIN') {
        if (branch.organizationId !== userOrgId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    } else {
        if (branchId !== userBranchId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }
    return null;
}

export async function GET(request: Request) {
    try {
        const syncUser = await validateSyncUser(request);
        if (syncUser instanceof NextResponse) return syncUser;

        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ error: "branchId is required" }, { status: 400 });
        }

        const accessError = await validateBranchAccess(syncUser, branchId);
        if (accessError) return accessError;

        // We want all debt payments belonging to sales created in this branch
        // Or if the debt payment itself was created in this branch. 
        // Currently, DebtPayment is tied directly to Sale, which is tied to Branch.
        const payments = await prisma.debtPayment.findMany({
            where: {
                sale: { branchId: branchId }
            },
            orderBy: { createdAt: 'desc' },
            take: 200, // Limit to recent 200 to prevent massive payloads 
            include: {
                sale: {
                    select: { patientId: true }
                }
            }
        });

        // Map to return just the necessary info
        const payload = payments.map((p: any) => ({
            id: p.id,
            saleId: p.saleId,
            amount: p.amount,
            method: p.method,
            note: p.note,
            createdAt: p.createdAt.toISOString(),
            patientId: p.sale?.patientId // Extracted for convenience
        }));

        console.log(`Sync debt payments: branchId=${branchId}, count=${payload.length}`);
        return NextResponse.json({ payments: payload });
    } catch (error: any) {
        console.error("Sync Debt Payments Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const syncUser = await validateSyncUser(request);
        if (syncUser instanceof NextResponse) return syncUser;

        const body = await request.json();
        const { branchId, payments } = body as {
            branchId: string;
            payments: Array<{
                id: string;
                saleId: string;
                userId?: string | null;
                amount: number;
                method: string;
                note?: string;
                createdAt: string;
            }>;
        };

        if (!branchId || !Array.isArray(payments) || payments.length === 0) {
            return NextResponse.json({ error: "branchId and payments are required" }, { status: 400 });
        }

        const accessError = await validateBranchAccess(syncUser, branchId);
        if (accessError) return accessError;

        const syncedIds: string[] = [];

        for (const payment of payments) {
            // Verify the sale belongs to this branch
            const sale = await prisma.sale.findUnique({
                where: { id: payment.saleId },
                select: { branchId: true, patientId: true },
            });

            if (!sale || sale.branchId !== branchId) continue;

            // Skip if already synced
            const existing = await prisma.debtPayment.findUnique({ where: { id: payment.id } });
            if (existing) {
                syncedIds.push(payment.id);
                continue;
            }

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                await tx.debtPayment.create({
                    data: {
                        id: payment.id,
                        saleId: payment.saleId,
                        userId: payment.userId || null,
                        amount: payment.amount,
                        method: (payment.method || "CASH") as any,
                        note: payment.note || null,
                        createdAt: new Date(payment.createdAt),
                    },
                });

                if (sale.patientId) {
                    await tx.patient.update({
                        where: { id: sale.patientId },
                        data: { balance: { decrement: payment.amount } },
                    });
                }
            });

            syncedIds.push(payment.id);
            await logAudit({
                userId: payment.userId ?? syncUser.id,
                userName: payment.userId ? await resolveUserName(payment.userId) : (syncUser.name ?? 'Desktop Sync'),
                action: 'DEBT_PAYMENT',
                entity: 'DEBT',
                entityId: payment.id,
                details: JSON.stringify({ saleId: payment.saleId, amount: payment.amount, source: 'desktop-sync' }),
                branchId,
            });
        }

        console.log(`[Sync] Debt payments received: ${payments.length}, synced: ${syncedIds.length}`);
        return NextResponse.json({ syncedIds });
    } catch (error: any) {
        console.error("Sync Debt Payments POST Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}
