export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function POST(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

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
                scientificName: true,
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
        const inventoryWhere: any = { drugId: drug.id, ...tenantBranchWhere };
        if (branchId) {
            inventoryWhere.branchId = branchId;
        }

        const inventoryRaw = await prisma.inventory.findFirst({
            where: inventoryWhere,
            select: {
                id: true,
                branchId: true,
                price: true,
                branch: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                batches: {
                    select: { quantity: true },
                    where: { quantity: { gt: 0 } },
                },
            },
        });

        // Compute total available quantity from batches
        const inventory = inventoryRaw
            ? {
                id: inventoryRaw.id,
                branchId: inventoryRaw.branchId,
                price: inventoryRaw.price,
                quantity: inventoryRaw.batches.reduce((sum: any, b: any) => sum + b.quantity, 0),
                branch: inventoryRaw.branch,
              }
            : null;

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
