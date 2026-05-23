export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { validateSyncUser, isBranchInSyncScope } from '@/app/lib/sync-auth';

type AckStatus = 'processed' | 'already_deleted' | 'noop';

function readIdempotencyKey(req: Request, body: any): string {
    const fromHeader = String(req.headers.get('x-idempotency-key') || '').trim();
    const fromBody = String(body?.clientActionId || '').trim();
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
    let idempotencyKey = '';
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const body = await req.json();
        const { inventoryId } = body;
        idempotencyKey = readIdempotencyKey(req, body);

        if (!inventoryId) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Missing inventoryId',
                    ack: makeAck('noop', idempotencyKey),
                },
                { status: 400 }
            );
        }

        // Tenant isolation: the inventory item must belong to a branch in the
        // caller's scope before we delete anything.
        const target = await prisma.inventory.findUnique({
            where: { id: inventoryId },
            select: { branchId: true },
        });
        if (!target) {
            return NextResponse.json({
                success: true,
                message: 'Inventory already deleted',
                ack: makeAck('already_deleted', idempotencyKey),
            });
        }
        if (!(await isBranchInSyncScope(syncUser, target.branchId))) {
            return NextResponse.json(
                { success: false, message: 'Forbidden', ack: makeAck('noop', idempotencyKey) },
                { status: 403 }
            );
        }

        console.log(`[API] Deleting inventory item: ${inventoryId}`);

        await prisma.batch.deleteMany({
            where: { inventoryId }
        });

        await prisma.inventory.delete({
            where: { id: inventoryId }
        });

        return NextResponse.json({
            success: true,
            message: 'Inventory deleted successfully',
            ack: makeAck('processed', idempotencyKey),
        });
    } catch (error: any) {
        if (
            error?.code === 'P2025' ||
            String(error?.message || '').toLowerCase().includes('record to delete does not exist')
        ) {
            return NextResponse.json({
                success: true,
                message: 'Inventory already deleted',
                ack: makeAck('already_deleted', idempotencyKey),
            });
        }

        console.error('Error deleting inventory from cloud:', error);
        return NextResponse.json(
            { success: false, message: String(error), ack: makeAck('noop', idempotencyKey) },
            { status: 500 }
        );
    }
}
