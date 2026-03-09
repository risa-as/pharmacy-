export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";


export async function POST(req: Request) {
    try {
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
                }
                stats.users = users.length;
            }

            // 2. Patients
            if (Array.isArray(patients)) {
                for (const p of patients) {
                    await tx.patient.upsert({
                        where: { id: p.id },
                        update: {
                            name: p.name,
                            phone: p.phone,
                            dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                            gender: p.gender,
                            allergies: p.allergies,
                            chronicDiseases: p.chronicDiseases,
                            notes: p.notes
                        },
                        create: {
                            id: p.id,
                            name: p.name,
                            phone: p.phone,
                            dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                            gender: p.gender,
                            allergies: p.allergies,
                            chronicDiseases: p.chronicDiseases,
                            notes: p.notes
                        }
                    });
                }
                stats.patients = patients.length;
            }

            // 3. Suppliers
            if (Array.isArray(suppliers)) {
                for (const s of suppliers) {
                    await tx.supplier.upsert({
                        where: { id: s.id },
                        update: {
                            name: s.name,
                            phone: s.phone,
                            email: s.email,
                            address: s.address,
                        },
                        create: {
                            id: s.id,
                            name: s.name,
                            phone: s.phone,
                            email: s.email,
                            address: s.address,
                        }
                    });
                }
                stats.suppliers = suppliers.length;
            }

            // 4. Global Drugs
            if (Array.isArray(drugs)) {
                for (const d of drugs) {
                    await tx.globalDrug.upsert({
                        where: { id: d.id },
                        update: {
                            barcode: d.barcode,
                            tradeName: d.tradeName,
                            scientificName: d.scientificName,
                            origin: d.origin,
                            image: d.image,
                            isActive: d.isActive
                        },
                        create: {
                            id: d.id,
                            barcode: d.barcode,
                            tradeName: d.tradeName,
                            scientificName: d.scientificName,
                            origin: d.origin,
                            image: d.image,
                            isActive: d.isActive
                        }
                    });
                }
                stats.drugs = drugs.length;
            }

            // 5. Inventories
            if (Array.isArray(inventories)) {
                for (const inv of inventories) {
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
                }
                stats.inventories = inventories.length;
            }

            // 6. Sales
            if (Array.isArray(sales)) {
                for (const sale of sales) {
                    // Normalize items if they exist on the sale object or need separate handling
                    // Assuming items are nested
                    const { items, ...saleData } = sale;

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
                }
                stats.sales = sales.length;
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
            message: "Restore failed: " + error.message
        }, { status: 500 });
    }
}
