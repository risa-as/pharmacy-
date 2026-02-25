import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

        const purchase = await prisma.purchase.findUnique({
            where: { id },
            include: {
                supplier: true,
                items: true,
                branch: {
                    select: { name: true }
                }
            }
        });

        if (!purchase) {
            return NextResponse.json({ message: "Purchase not found" }, { status: 404 });
        }

        // Fetch drug names
        const drugIds = purchase.items.map(i => i.drugId);
        const drugs = await prisma.globalDrug.findMany({
            where: { id: { in: drugIds } },
            select: { id: true, tradeName: true, scientificName: true }
        });
        const drugMap = new Map(drugs.map(d => [d.id, d]));

        const itemsWithNames = purchase.items.map(item => {
            const drug = drugMap.get(item.drugId);
            return {
                ...item,
                drugName: drug?.tradeName || 'Unknown',
                scientificName: drug?.scientificName
            };
        });

        return NextResponse.json({
            ...purchase,
            items: itemsWithNames
        });

    } catch (error) {
        console.error("Purchase Details API Error:", error);
        return NextResponse.json({ message: "Failed to fetch purchase details" }, { status: 500 });
    }
}
