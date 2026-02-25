import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
    try {
        const suppliers = await prisma.supplier.findMany({
            select: {
                id: true,
                name: true,
                phone: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(suppliers);
    } catch (error) {
        console.error("Suppliers API Error:", error);
        return NextResponse.json({ message: "Failed to fetch suppliers" }, { status: 500 });
    }
}
