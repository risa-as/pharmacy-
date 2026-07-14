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
    /** ISO string, Excel serial number, or Date-parsable string. */
    expiryDate?: string | number;
    scientificName?: string;
    manufacturer?: string;
    batchNumber?: string;
    minStock?: number;
    maxStock?: number;
}

/** Excel stores dates as serial day counts (25569 = 1970-01-01). */
function parseExpiry(value: string | number | undefined): Date | null {
    if (value == null || value === "") return null;
    if (typeof value === "number") {
        if (value < 25569 || value > 80000) return null; // outside 1970..2119 → not a date
        return new Date(Math.round((value - 25569) * 86_400_000));
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
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
        if (rows.length > 500) {
            return NextResponse.json(
                { error: "الحد الأقصى 500 صف لكل طلب — قسّم الملف على دفعات" },
                { status: 400 }
            );
        }

        // Resolve the target branch WITHIN the tenant's organization only.
        const tenantOrgId = tenantCtx.organizationId; // undefined for SUPER_ADMIN
        const branch = branchId
            ? await prisma.branch.findFirst({
                  where: { id: branchId, ...(tenantOrgId ? { organizationId: tenantOrgId } : {}) },
              })
            : await prisma.branch.findFirst({
                  where: tenantOrgId ? { organizationId: tenantOrgId } : {},
              });

        if (!branch) {
            return NextResponse.json(
                { error: "الفرع غير موجود أو لا ينتمي لمؤسستك" },
                { status: 400 }
            );
        }
        // Effective org: the branch's org (covers SUPER_ADMIN importing on behalf).
        const orgId = tenantOrgId ?? branch.organizationId ?? null;

        let imported = 0;   // new drugs created (org-owned)
        let updated = 0;    // existing drugs matched
        let batches = 0;
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowLabel = row?.name || `صف ${i + 1}`;
            try {
                if (!row.name || row.price == null || Number(row.price) <= 0) {
                    errors.push(`${rowLabel}: الاسم أو سعر البيع مفقود`);
                    continue;
                }
                const price = Number(row.price);
                const cost = Number(row.cost) || 0;
                const quantity = Math.max(0, Math.floor(Number(row.quantity) || 0));
                const barcode = String(row.barcode ?? "").trim();

                // ── Drug matching precedence ─────────────────────────────────
                // 1. This org's own drug (by barcode, then by trade name)
                // 2. The shared/global catalog (organizationId: null) — read-only
                // 3. Another org's drug with the same barcode must NEVER match:
                //    tenants stay fully isolated, so we create our own record.
                let drug =
                    (barcode
                        ? (orgId
                              ? await prisma.globalDrug.findFirst({ where: { barcode, organizationId: orgId } })
                              : null) ??
                          (await prisma.globalDrug.findFirst({ where: { barcode, organizationId: null } }))
                        : null) ??
                    (orgId
                        ? await prisma.globalDrug.findFirst({ where: { tradeName: row.name, organizationId: orgId } })
                        : null) ??
                    (await prisma.globalDrug.findFirst({ where: { tradeName: row.name, organizationId: null } }));

                if (!drug) {
                    drug = await prisma.globalDrug.create({
                        data: {
                            tradeName: row.name,
                            barcode: barcode || `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            scientificName: row.scientificName || "",
                            origin: row.manufacturer || "",
                            organizationId: orgId,
                        },
                    });
                    imported++;
                } else {
                    // Only org-owned drugs may be enriched; the shared catalog is read-only.
                    if (orgId && drug.organizationId === orgId && (row.scientificName || row.manufacturer)) {
                        await prisma.globalDrug.update({
                            where: { id: drug.id },
                            data: {
                                ...(row.scientificName ? { scientificName: row.scientificName } : {}),
                                ...(row.manufacturer ? { origin: row.manufacturer } : {}),
                            },
                        });
                    }
                    updated++;
                }

                const inventoryData = {
                    price,
                    ...(cost > 0 ? { cost } : {}),
                    ...(row.minStock != null && Number(row.minStock) >= 0 ? { minStock: Math.floor(Number(row.minStock)) } : {}),
                    ...(row.maxStock != null && Number(row.maxStock) > 0 ? { maxStock: Math.floor(Number(row.maxStock)) } : {}),
                };

                const inventory = await prisma.inventory.upsert({
                    where: { drugId_branchId: { drugId: drug.id, branchId: branch.id } },
                    create: { drugId: drug.id, branchId: branch.id, cost, ...inventoryData },
                    update: inventoryData,
                });

                if (quantity > 0) {
                    await prisma.batch.create({
                        data: {
                            inventoryId: inventory.id,
                            quantity,
                            // Batch cost drives FEFO sale costing — 0 here corrupts profit reports.
                            costPrice: cost,
                            batchNumber: String(row.batchNumber || `IMP-${new Date().toISOString().slice(0, 10)}`),
                            expiryDate: parseExpiry(row.expiryDate) ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        },
                    });
                    batches++;
                }
            } catch (rowError: any) {
                errors.push(`${rowLabel}: ${rowError.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            imported,
            updated,
            batches,
            errors: errors.slice(0, 50),
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
