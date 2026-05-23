export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";


export async function POST(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canBackup) {
            return NextResponse.json({ success: false, message: "ليس لديك صلاحية للنسخ الاحتياطي." }, { status: 403 });
        }

        // ── Tenant scope ─────────────────────────────────────────────────────
        // A restore must only ever write records that belong to the caller's own
        // organization. Without this, an org admin could craft a backup that
        // creates SUPER_ADMIN users, overwrites another tenant's data, or resets
        // any user's password by id.
        const isSuper = tenantCtx.user.role === 'SUPER_ADMIN';
        const orgId = tenantCtx.organizationId;

        let allowedBranchIds: Set<string> | null = null; // null = unrestricted (super admin only)
        if (!isSuper) {
            if (!orgId) {
                return NextResponse.json({ success: false, message: "No organization context" }, { status: 403 });
            }
            const branches = await prisma.branch.findMany({
                where: { organizationId: orgId },
                select: { id: true },
            });
            allowedBranchIds = new Set(branches.map((b: { id: string }) => b.id));
        }
        const branchAllowed = (b?: string | null) => isSuper || (!!b && allowedBranchIds!.has(b));
        const orgAllowed = (o?: string | null) => isSuper || (!!o && o === orgId);

        const body = await req.json();

        // Support both direct data object or wrapped in "data" key (as exported)
        const data = body.data || body;

        if (!data || typeof data !== 'object') {
            return NextResponse.json({ success: false, message: "Invalid JSON format" }, { status: 400 });
        }

        const { users, patients, suppliers, drugs, inventories, sales } = data;

        let stats = {
            users: 0,
            patients: 0,
            suppliers: 0,
            drugs: 0,
            inventories: 0,
            sales: 0
        };

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Users
            if (Array.isArray(users)) {
                for (const user of users) {
                    if (!user?.id) continue;
                    // Never import or elevate a user to platform-staff role.
                    if (user.role === 'SUPER_ADMIN') continue;
                    // Target branch must be within the caller's scope.
                    if (!branchAllowed(user.branchId)) continue;
                    // If the user already exists, it must already belong to the
                    // caller's scope (prevents cross-tenant password/role overwrite).
                    const existingUser = await tx.user.findUnique({
                        where: { id: user.id },
                        select: { branchId: true },
                    });
                    if (existingUser && !branchAllowed(existingUser.branchId)) continue;

                    await tx.user.upsert({
                        where: { id: user.id },
                        update: {
                            name: user.name,
                            email: user.email,
                            password: user.password,
                            role: user.role,
                            branchId: user.branchId
                        },
                        create: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            password: user.password,
                            role: user.role,
                            branchId: user.branchId
                        }
                    });
                    stats.users++;
                }
            }

            // 2. Patients
            if (Array.isArray(patients)) {
                for (const p of patients) {
                    if (!p?.id) continue;
                    if (!branchAllowed(p.branchId)) continue;
                    const existingPatient = await tx.patient.findUnique({
                        where: { id: p.id },
                        select: { branchId: true },
                    });
                    if (existingPatient && !branchAllowed(existingPatient.branchId)) continue;

                    await tx.patient.upsert({
                        where: { id: p.id },
                        update: {
                            name: p.name,
                            phone: p.phone,
                            dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                            gender: p.gender,
                            allergies: p.allergies,
                            chronicDiseases: p.chronicDiseases,
                            notes: p.notes,
                            branchId: p.branchId
                        },
                        create: {
                            id: p.id,
                            name: p.name,
                            phone: p.phone,
                            dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                            gender: p.gender,
                            allergies: p.allergies,
                            chronicDiseases: p.chronicDiseases,
                            notes: p.notes,
                            branchId: p.branchId
                        }
                    });
                    stats.patients++;
                }
            }

            // 3. Suppliers (org-scoped)
            if (Array.isArray(suppliers)) {
                for (const s of suppliers) {
                    if (!s?.id) continue;
                    const existingSupplier = await tx.supplier.findUnique({
                        where: { id: s.id },
                        select: { organizationId: true },
                    });
                    if (existingSupplier && !orgAllowed(existingSupplier.organizationId)) continue;
                    const supplierOrg = isSuper ? (s.organizationId ?? null) : orgId;

                    await tx.supplier.upsert({
                        where: { id: s.id },
                        update: {
                            name: s.name,
                            phone: s.phone,
                            email: s.email,
                            address: s.address,
                            organizationId: supplierOrg,
                        },
                        create: {
                            id: s.id,
                            name: s.name,
                            phone: s.phone,
                            email: s.email,
                            address: s.address,
                            organizationId: supplierOrg,
                        }
                    });
                    stats.suppliers++;
                }
            }

            // 4. Custom Drugs (org-scoped). The shared global catalog
            //    (organizationId = null) is never modified via tenant restore.
            if (Array.isArray(drugs)) {
                for (const d of drugs) {
                    if (!d?.id) continue;
                    const existingDrug = await tx.globalDrug.findUnique({
                        where: { id: d.id },
                        select: { organizationId: true },
                    });
                    // Only touch drugs that already belong to the caller's org.
                    if (existingDrug && !orgAllowed(existingDrug.organizationId)) continue;
                    const drugOrg = isSuper ? (d.organizationId ?? null) : orgId;

                    await tx.globalDrug.upsert({
                        where: { id: d.id },
                        update: {
                            barcode: d.barcode,
                            tradeName: d.tradeName,
                            scientificName: d.scientificName,
                            origin: d.origin,
                            image: d.image,
                            isActive: d.isActive,
                            organizationId: drugOrg,
                        },
                        create: {
                            id: d.id,
                            barcode: d.barcode,
                            tradeName: d.tradeName,
                            scientificName: d.scientificName,
                            origin: d.origin,
                            image: d.image,
                            isActive: d.isActive,
                            organizationId: drugOrg,
                        }
                    });
                    stats.drugs++;
                }
            }

            // 5. Inventories
            if (Array.isArray(inventories)) {
                for (const inv of inventories) {
                    if (!inv?.id) continue;
                    if (!branchAllowed(inv.branchId)) continue;
                    const existingInv = await tx.inventory.findUnique({
                        where: { id: inv.id },
                        select: { branchId: true },
                    });
                    if (existingInv && !branchAllowed(existingInv.branchId)) continue;
                    // Check if drug exists first (to be safe, though step 4 should cover it)
                    const drugExists = await tx.globalDrug.findUnique({ where: { id: inv.drugId } });
                    if (!drugExists) continue; // Skip orphan inventory

                    await tx.inventory.upsert({
                        where: { id: inv.id },
                        update: {
                            minStock: inv.minStock ?? inv.minLevel ?? 0,
                            maxStock: inv.maxStock ?? inv.maxLevel ?? 1000,
                            branchId: inv.branchId,
                            price: inv.price ?? 0,
                            cost: inv.cost ?? 0
                        },
                        create: {
                            id: inv.id,
                            drugId: inv.drugId,
                            minStock: inv.minStock ?? inv.minLevel ?? 0,
                            maxStock: inv.maxStock ?? inv.maxLevel ?? 1000,
                            branchId: inv.branchId,
                            price: inv.price ?? 0,
                            cost: inv.cost ?? 0
                        }
                    });
                    stats.inventories++;
                }
            }

            // 6. Sales
            if (Array.isArray(sales)) {
                for (const sale of sales) {
                    if (!sale?.id) continue;
                    if (!branchAllowed(sale.branchId)) continue;
                    const existingSale = await tx.sale.findUnique({
                        where: { id: sale.id },
                        select: { branchId: true },
                    });
                    if (existingSale && !branchAllowed(existingSale.branchId)) continue;
                    // Normalize items if they exist on the sale object or need separate handling
                    // Assuming items are nested
                    const { items } = sale;

                    await tx.sale.upsert({
                        where: { id: sale.id },
                        update: {
                            total: sale.total,
                            createdAt: sale.createdAt,
                            userId: sale.userId,
                            patientId: sale.patientId,
                            branchId: sale.branchId
                        },
                        create: {
                            id: sale.id,
                            total: sale.total,
                            createdAt: sale.createdAt,
                            userId: sale.userId,
                            patientId: sale.patientId,
                            branchId: sale.branchId
                        }
                    });

                    // Upsert Sale Items if present
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            await tx.saleItem.upsert({
                                where: { id: item.id },
                                update: {
                                    quantity: item.quantity,
                                    price: item.price,
                                    cost: item.cost ?? 0
                                },
                                create: {
                                    id: item.id,
                                    saleId: sale.id,
                                    drugId: item.drugId,
                                    quantity: item.quantity,
                                    price: item.price,
                                    cost: item.cost ?? 0
                                }
                            });
                        }
                    }
                    stats.sales++;
                }
            }
        }, {
            maxWait: 10000, // 10s max wait for connection
            timeout: 60000  // 60s timeout for large backups
        });

        return NextResponse.json({
            success: true,
            message: "Restore completed successfully",
            stats
        });

    } catch (error: any) {
        console.error("Restore failed:", error);
        return NextResponse.json({
            success: false,
            message: "Restore failed"
        }, { status: 500 });
    }
}
