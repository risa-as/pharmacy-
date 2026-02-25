import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET: Patient's orders
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const patientId = searchParams.get('patientId');

        if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

        const orders = await prisma.patientAppOrder.findMany({
            where: { patientId },
            include: {
                branch: { select: { name: true } },
                items: {
                    include: {
                        drug: { select: { tradeName: true, barcode: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ orders });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Place a new order (request medication)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { patientId, branchId, prescriptionUrl, deliveryAddress, notes, items } = body;

        if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

        const orderData: any = {
            patientId,
            branchId: branchId || null,
            prescriptionUrl: prescriptionUrl || null,
            deliveryAddress: deliveryAddress || null,
            notes: notes || null,
        };

        if (items?.length > 0) {
            orderData.totalAmount = items.reduce((s: number, i: any) => s + (i.quantity * i.price), 0);
            orderData.items = {
                create: items.map((item: any) => ({
                    drugId: item.drugId,
                    quantity: item.quantity,
                    price: item.price
                }))
            };
        }

        const order = await prisma.patientAppOrder.create({
            data: orderData,
            include: { items: true }
        });

        return NextResponse.json({ order }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
