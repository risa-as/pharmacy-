import { Prisma } from '@prisma/client';
'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { saleLoyaltyStamp } from '@/app/lib/loyalty-rate';

export async function getWebProducts(searchTerm: string = "") {
    const tenantCtx = await getTenantContext('read');
    if (tenantCtx instanceof NextResponse) return [];

    // In getTenantContext, user is guaranteed to be there if it's not a NextResponse.
    const { tenantBranchWhere, user } = tenantCtx;
    const branchId = user?.branchId;

    try {
        const inventories = await prisma.inventory.findMany({
            where: tenantBranchWhere,
            include: {
                drug: true,
                batches: {
                    where: { quantity: { gt: 0 }, expiryDate: { gt: new Date() } },
                    orderBy: { expiryDate: 'asc' }
                }
            }
        });

        const products = inventories.map((inv: any) => {
            const stock = inv.batches.reduce((sum: number, b: any) => sum + b.quantity, 0);
            return {
                id: inv.drug.id,
                inventoryId: inv.id, // Keep track for deduction later
                name: inv.drug.tradeName,
                scientificName: inv.drug.scientificName,
                price: inv.price,
                stock: stock,
                barcode: inv.drug.barcode,
                costPrice: inv.cost
            };
        });

        if (!searchTerm) {
            return products;
        }

        const lowerSearch = searchTerm.toLowerCase();
        return products.filter((p: any) =>
            p.name.toLowerCase().includes(lowerSearch) ||
            (p.barcode && p.barcode.includes(searchTerm)) ||
            (p.scientificName && p.scientificName.toLowerCase().includes(lowerSearch))
        );

    } catch (error) {
        console.error("Error fetching web products:", error);
        return [];
    }
}


export async function getWebPatients(searchTerm: string = "") {
    const tenantCtx = await getTenantContext('read');
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    try {
        if (!searchTerm) {
            // Return recent patients
            return await prisma.patient.findMany({
                where: tenantBranchWhere,
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: { loyaltyAccount: true }
            });
        }

        return await prisma.patient.findMany({
            where: {
                ...tenantBranchWhere,
                OR: [
                    { name: { contains: searchTerm } },
                    { phone: { contains: searchTerm } }
                ]
            },
            take: 10,
            include: { loyaltyAccount: true }
        });

    } catch (error) {
        console.error("Error fetching web patients:", error);
        return [];
    }
}


export async function processWebSale(data: {
    items: any[],
    total: number,
    patientId?: string,
    discount: number,
    pointsRedeemed: number,
    paymentMethod: string
}) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { success: false, error: "غير مصرح" };

    const { tenantBranchWhere, user, organizationId } = tenantCtx;
    const branchId = user?.branchId;

    if (!user || !user.id || !branchId) return { success: false, error: "جلسة المستخدم غير صالحة" };

    if (!tenantCtx.userPermissions.canSell) return { success: false, error: 'ليس لديك صلاحية البيع.' };
    if (!Number.isFinite(data.total) || data.total < 0 || !Number.isFinite(data.discount) || data.discount < 0 || (data.discount > 0 && !tenantCtx.userPermissions.canApplyDiscount)) return { success: false, error: 'قيمة أو صلاحية الخصم غير صالحة.' };
    if (!['CASH','CARD','CREDIT'].includes(data.paymentMethod)) return { success: false, error: 'طريقة الدفع غير صالحة.' };
    if (!Array.isArray(data.items) || data.items.length > 500 || new Set(data.items.map(i => String(i.id))).size !== data.items.length || data.items.some(i => !Number.isInteger(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.price) || i.price < 0)) return { success: false, error: 'أصناف البيع غير صالحة.' };
    try {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const validPatient = data.patientId
                ? await tx.patient.findFirst({ where: { id: data.patientId, branchId } })
                : null;

            if (data.patientId && !validPatient) throw new Error('العميل خارج نطاق الفرع.');
            const isCredit = data.paymentMethod === "CREDIT";
            if (isCredit && !validPatient) {
                throw new Error("يجب تحديد عميل للبيع بالآجل");
            }

            const incomingItems = Array.isArray(data.items) ? data.items : [];
            if (incomingItems.length === 0) {
                throw new Error("السلة فارغة");
            }

            const saleItemsData = [];

            // FEFO inventory deduction
            for (const item of incomingItems) {
                const allocations: { batchId: string; quantity: number }[] = [];
                let itemTotalCost = 0;
                let remainingToDeduct = item.quantity;

                // Make sure to find inventory for the current branch
                const inventory = await tx.inventory.findFirst({
                    where: { drugId: String(item.id), branchId: branchId },
                    include: {
                        batches: {
                            orderBy: { expiryDate: "asc" },
                            where: { quantity: { gt: 0 } },
                        },
                    },
                });

                if (inventory && Math.abs(Number(item.price) - inventory.price) > .01 && !tenantCtx.userPermissions.canEditPrice && !(item.price < inventory.price && tenantCtx.userPermissions.canApplyDiscount)) throw new Error('تغيير السعر يحتاج صلاحية.');
                if (inventory) {
                    if (inventory.batches && inventory.batches.length > 0) {
                        for (const batch of inventory.batches) {
                            if (remainingToDeduct <= 0) break;
                            const deduction = Math.min(batch.quantity, remainingToDeduct);
                            itemTotalCost += deduction * (batch as any).costPrice;

                            if (deduction > 0) {
                                const deducted = await tx.batch.updateMany({
                                    where: { id: batch.id, quantity: { gte: deduction }, expiryDate: { gt: new Date() } },
                                    data: { quantity: { decrement: deduction } },
                                });
                                if (deducted.count !== 1) throw new Error('تغير المخزون؛ حدّث البيانات.');
                                allocations.push({ batchId: batch.id, quantity: deduction });
                        remainingToDeduct -= deduction;
                            }
                        }
                    }

                    // Fallback cost if batches insufficient
                    if (remainingToDeduct > 0 && (inventory as any).costPrice) {
                        itemTotalCost += remainingToDeduct * (inventory as any).costPrice;
                    }
                } else {
                    throw new Error(`لم يتم العثور على مخزون للمنتج ${item.name}`);
                }

                if (remainingToDeduct > 0) throw new Error('الكمية الصالحة المتاحة لا تكفي للبيع.');
                const unitCost = item.quantity > 0 ? itemTotalCost / item.quantity : 0;

                saleItemsData.push({
                    drugId: String(item.id),
                    quantity: item.quantity,
                    price: Number(item.price),
                    batchAllocations: JSON.stringify(allocations),
                    cost: unitCost,
                });
            }

            // Server-side total validation — reject tampered totals
            const serverTotal = saleItemsData.reduce(
                (sum, i) => sum + i.price * i.quantity,
                0
            ) - (data.discount || 0);
            if (Math.abs(serverTotal - data.total) > 0.01) {
                throw new Error(`Total mismatch: client sent ${data.total}, server computed ${serverTotal.toFixed(2)}`);
            }

            const sale = await tx.sale.create({
                data: {
                    ...await saleLoyaltyStamp(tx, branchId),
                    total: data.total,
                    discount: data.discount || 0,
                    userId: user.id,
                    patientId: validPatient?.id ?? null,
                    branchId: branchId,
                    payment: {
                        create: {
                            amount: data.total,
                            method: (data.paymentMethod as any) || "CASH",
                            status: isCredit ? "PENDING" : "COMPLETED",
                        },
                    },
                    items: {
                        create: saleItemsData,
                    },
                },
            });

            // If Cash sale, update Safe and create Safe Transaction
            // For Web POS Temporary: Just find the first safe for this branch
            if (!isCredit && data.paymentMethod === "CASH") {
                const availableSafe = await tx.safe.findFirst({
                    where: { branchId: branchId, type: "CASH_DRAWER" }
                });

                if (availableSafe) {
                    await tx.sale.update({ where: { id: sale.id }, data: { safeId: availableSafe.id } });
                    await tx.transaction.create({
                        data: {
                            safeId: availableSafe.id,
                            type: "IN",
                            amount: data.total,
                            referenceType: "SALE",
                            description: `مبيعات نقدية ويب فاتورة #${sale.documentNumber}`,
                        },
                    });

                    await tx.safe.update({
                        where: { id: availableSafe.id },
                        data: { balance: { increment: data.total } },
                    });
                }
            }

            // Update patient local debt if credit
            if (isCredit && validPatient) {
                await tx.patient.update({
                    where: { id: validPatient.id },
                    data: { balance: { increment: data.total } },
                });
            }

            // Loyalty System Logic
            const settings = await tx.companySettings.findFirst({
                where: { organizationId: organizationId ?? undefined },
            });

            // Handle Redemption (Debit)
            if (settings?.loyaltyEnabled && validPatient && data.pointsRedeemed > 0) {
                const loyaltyAccount = await tx.loyaltyAccount.findUnique({
                    where: { patientId: validPatient.id },
                });

                if (loyaltyAccount) {
                    if (loyaltyAccount.totalPoints >= data.pointsRedeemed) {
                        await tx.loyaltyAccount.update({
                            where: { id: loyaltyAccount.id },
                            data: { totalPoints: { decrement: data.pointsRedeemed } },
                        });

                        await tx.loyaltyTransaction.create({
                            data: {
                                accountId: loyaltyAccount.id,
                                points: -data.pointsRedeemed,
                                type: "REDEMPTION",
                                description: `استبدال لنقاط البيع #${sale.documentNumber}`,
                            },
                        });
                    }
                }
            }

            // Handle Earnings (Credit)
            if (!isCredit && settings?.loyaltyEnabled && validPatient) {
                const pointsEarned = Math.floor(data.total * (settings.loyaltyPointsPerDinar || 0.01));

                if (pointsEarned > 0) {
                    const loyaltyAccount = await tx.loyaltyAccount.findUnique({
                        where: { patientId: validPatient.id },
                    });

                    if (loyaltyAccount) {
                        const newLifetime = loyaltyAccount.lifetimePoints + pointsEarned;
                        let newTier = "BRONZE";
                        if (newLifetime >= 20000) newTier = "GOLD";
                        else if (newLifetime >= 5000) newTier = "SILVER";

                        await tx.loyaltyAccount.update({
                            where: { id: loyaltyAccount.id },
                            data: {
                                totalPoints: { increment: pointsEarned },
                                lifetimePoints: { increment: pointsEarned },
                                tier: newTier,
                            },
                        });

                        await tx.loyaltyTransaction.create({
                            data: {
                                accountId: loyaltyAccount.id,
                                points: pointsEarned,
                                type: "EARN",
                                description: `نقاط مكتسبة من فاتورة #${sale.documentNumber}`,
                            },
                        });
                    }
                }
            }

            return sale;
        });

        revalidatePath('/dashboard/sales');
        revalidatePath('/dashboard/inventory');

        await logAudit({
            userId: user.id,
            userName: user.name ?? user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'SALE',
            entityId: result.id,
            details: JSON.stringify({ total: result.total, discount: result.discount, itemCount: data.items?.length }),
            branchId: branchId,
        });

        return { success: true, sale: result };
    } catch (error: any) {
        console.error("Process Web Sale Error:", error);
        return { success: false, error: error.message || "حدث خطأ أثناء معالجة عملية البيع" };
    }
}
