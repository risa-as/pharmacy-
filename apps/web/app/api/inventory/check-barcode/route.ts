import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const { barcode, branchId } = await req.json();

        if (!barcode) {
            return NextResponse.json({ success: false, message: "Barcode is required" }, { status: 400 });
        }

        // 1. Check if drug exists globally
        const drug = await prisma.globalDrug.findUnique({
            where: { barcode },
            select: {
                id: true,
                barcode: true,
                tradeName: true,
            },
        });

        if (!drug) {
            return NextResponse.json({
                success: true,
                exists: false,
                message: "Drug not found"
            });
        }

        // 2. Check if inventory exists for this drug
        const inventoryWhere: any = { drugId: drug.id };
        if (branchId) {
            inventoryWhere.branchId = branchId;
        }

        const inventory = await prisma.inventory.findFirst({
            where: inventoryWhere,
            select: {
                id: true,
                branchId: true,
                branch: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            }, // distinct? just first one for now
        });

        return NextResponse.json({
            success: true,
            exists: true,
            drug,
            inventory
        });

    } catch (error: any) {
        console.error("Barcode check failed:", error);
        return NextResponse.json({
            success: false,
            message: "Error checking barcode: " + error.message
        }, { status: 500 });
    }
}
