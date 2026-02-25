import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { branchId, supplierId, items } = body;

        if (!branchId || !supplierId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ message: "Invalid request data" }, { status: 400 });
        }

        // Calculate total
        const total = items.reduce((sum: number, item: any) => sum + (item.quantity * item.cost), 0);

        const purchase = await prisma.purchase.create({
            data: {
                branchId,
                supplierId,
                total,
                status: 'PENDING',
                items: {
                    create: items.map((item: any) => ({
                        drugId: item.drugId,
                        quantity: item.quantity,
                        cost: item.cost
                    }))
                }
            }
        });

        return NextResponse.json({ success: true, purchaseId: purchase.id });
    } catch (error) {
        console.error("Create Purchase API Error:", error);
        return NextResponse.json({ message: "Failed to create purchase" }, { status: 500 });
    }
}
