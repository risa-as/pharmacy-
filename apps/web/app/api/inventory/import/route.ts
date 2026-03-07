export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

interface ImportRow {
    name: string;
    barcode?: string;
    price: number;
    cost: number;
    quantity: number;
    expiryDate?: string;
    scientificName?: string;
    manufacturer?: string;
}

export async function POST(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const { rows, branchId } = (await req.json()) as {
            rows: ImportRow[];
            branchId?: string;
        };

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json(
                { error: "لا توجد بيانات للاستيراد" },
                { status: 400 }
            );
        }

        // Get default branch
        const branch = branchId
            ? await prisma.branch.findUnique({ where: { id: branchId } })
            : await prisma.branch.findFirst();

        if (!branch) {
            return NextResponse.json(
                { error: "لا يوجد فرع. يرجى إنشاء فرع أولاً" },
                { status: 400 }
            );
        }

        let imported = 0;
        let updated = 0;
        let errors: string[] = [];

        for (const row of rows) {
            try {
                if (!row.name || row.price == null) {
                    errors.push(`تم تخطي صف: الاسم أو السعر مفقود`);
                    continue;
                }

                // Check if drug exists by barcode or name
                let drug = row.barcode
                    ? await prisma.globalDrug.findFirst({
                        where: { barcode: row.barcode },
                    })
                    : null;

                if (!drug) {
                    drug = await prisma.globalDrug.findFirst({
                        where: { tradeName: row.name },
                    });
                }

                if (!drug) {
                    // Create new drug
                    drug = await prisma.globalDrug.create({
                        data: {
                            tradeName: row.name,
                            barcode: row.barcode || `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            scientificName: row.scientificName || "",
                            origin: row.manufacturer || "",
                        },
                    });
                    imported++;
                } else {
                    updated++;
                }

                // Check if inventory exists for this drug + branch
                let inventory = await prisma.inventory.findUnique({
                    where: {
                        drugId_branchId: {
                            drugId: drug.id,
                            branchId: branch.id,
                        },
                    },
                });

                if (!inventory) {
                    inventory = await prisma.inventory.create({
                        data: {
                            drugId: drug.id,
                            branchId: branch.id,
                            price: row.price,
                            cost: row.cost || 0,
                        },
                    });
                } else {
                    await prisma.inventory.update({
                        where: { id: inventory.id },
                        data: {
                            price: row.price,
                            cost: row.cost || inventory.cost,
                        },
                    });
                }

                // Create batch if quantity provided
                if (row.quantity > 0) {
                    await prisma.batch.create({
                        data: {
                            inventoryId: inventory.id,
                            quantity: row.quantity,
                            batchNumber: `IMP-${new Date().toISOString().slice(0, 10)}`,
                            expiryDate: row.expiryDate
                                ? new Date(row.expiryDate)
                                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // default 1 year
                        },
                    });
                }
            } catch (rowError: any) {
                errors.push(`خطأ في "${row.name}": ${rowError.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            imported,
            updated,
            errors: errors.slice(0, 20), // limit errors
            total: rows.length,
        });
    } catch (error: any) {
        console.error("Import error:", error);
        return NextResponse.json(
            { error: error.message || "حدث خطأ أثناء الاستيراد" },
            { status: 500 }
        );
    }
}
