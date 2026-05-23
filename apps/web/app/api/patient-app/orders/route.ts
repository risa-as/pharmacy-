export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getPatientUserId } from '@/app/lib/patient-app-auth';

// GET: Patient's orders
export async function GET(req: NextRequest) {
    try {
        const patientId = await getPatientUserId(req);
        if (patientId instanceof NextResponse) return patientId;

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
        console.error('Patient-app orders error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Place a new order (request medication)
export async function POST(req: NextRequest) {
    try {
        const patientId = await getPatientUserId(req);
        if (patientId instanceof NextResponse) return patientId;

        const body = await req.json();
        const { branchId, prescriptionUrl, deliveryAddress, notes, items } = body;

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
        console.error('Patient-app orders error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
