import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

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
