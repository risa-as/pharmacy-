export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

// GET: List orders for a warehouse (or all)
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const warehouseId = searchParams.get('warehouseId');
        const branchId = searchParams.get('branchId');
        const status = searchParams.get('status');

        const where: any = {};
        if (warehouseId) where.warehouseId = warehouseId;
        if (branchId) where.branchId = branchId;
        if (status) where.status = status;

        const orders = await prisma.warehouseOrder.findMany({
            where,
            include: {
                warehouse: { select: { name: true } },
                branch: { select: { name: true } },
                items: { include: { drug: { select: { tradeName: true, barcode: true } } } }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        return NextResponse.json({ orders });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Create a new order to a warehouse
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { warehouseId, branchId, items, notes, expectedDate } = body;

        if (!warehouseId || !branchId || !items?.length) {
            return NextResponse.json({ error: "warehouseId, branchId, and items are required" }, { status: 400 });
        }

        // Generate order number
        const count = await prisma.warehouseOrder.count();
        const orderNumber = `WO-${String(count + 1).padStart(6, '0')}`;

        const totalAmount = items.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0);

        const order = await prisma.warehouseOrder.create({
            data: {
                warehouseId,
                branchId,
                orderNumber,
                totalAmount,
                notes,
                expectedDate: expectedDate ? new Date(expectedDate) : null,
                items: {
                    create: items.map((item: any) => ({
                        drugId: item.drugId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice || 0,
                        totalPrice: item.quantity * (item.unitPrice || 0)
                    }))
                }
            },
            include: { items: true }
        });

        return NextResponse.json({ order }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
