export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { pharmacyDrugScope } from "@/app/lib/drug-scope";

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
        const drug = await prisma.globalDrug.findFirst({
            // النطاق: الكتالوج العالمي + أدوية هذه المؤسسة، بلا صفوف المذاخر ولا
            // أدوية المؤسسات الأخرى — انظر app/lib/drug-scope.ts.
            where: { barcode, ...pharmacyDrugScope(tenantCtx.organizationId) },
            select: {
                id: true,
                barcode: true,
                tradeName: true,
                scientificName: true,
                // ميزة وحدة التسعير: يُضافان إلى هذا الاستعلام القائم بدل أن
                // تجلبهما نافذة الدفعة برحلة ثانية — الإدخال السريع هو المسار
                // الأساسي لإدخال الأدوية، وكل رحلة إلى Neon تكلف قرابة 183ms.
                unitsPerPack: true,
                unitsPerPackConfirmedAt: true,
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
                // بلا مرشّح على الرصيد: الرصيد وآخر كلفة يُحسبان معاً من هذا الجلب
                // الواحد. الفصل إلى علاقتين غير ممكن في Prisma، والدفعة المنتهية
                // مطلوبة للسعر وإن لم تعد مطلوبة للرصيد.
                batches: {
                    select: { quantity: true, costPrice: true, createdAt: true },
                },
            },
        });

        // أحدث دفعة ذات كلفة موجبة — دفعة البونص بكلفة صفر ليست مرجعاً للسعر.
        const priced = (inventoryRaw?.batches ?? [])
            .filter((b) => b.costPrice > 0)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        // Compute total available quantity from batches
        const inventory = inventoryRaw
            ? {
                id: inventoryRaw.id,
                branchId: inventoryRaw.branchId,
                price: inventoryRaw.price,
                quantity: inventoryRaw.batches.reduce(
                    (sum, b) => sum + (b.quantity > 0 ? b.quantity : 0),
                    0,
                ),
                branch: inventoryRaw.branch,
                lastStripCost: priced?.costPrice ?? null,
                lastCostAt: priced?.createdAt.toISOString() ?? null,
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
