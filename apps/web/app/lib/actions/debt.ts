"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';

// جلب جميع المدينين
export async function getAllDebtors(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { user, organizationId } = tenantCtx;

    // Filter by the SALE's branch, not the patient's registration branch.
    // A patient may have branchId=null (created before tenant isolation) but still owe
    // money via a credit sale that IS scoped to this org/branch.
    const saleFilter: any = { payment: { method: "CREDIT" } };
    if (branchId) {
        saleFilter.branchId = branchId;
    } else if (user.role === 'ADMIN' && organizationId) {
        saleFilter.branch = { organizationId };
    } else if (user.branchId) {
        saleFilter.branchId = user.branchId;
    }

    const patients = await prisma.patient.findMany({
        where: {
            balance: { gt: 0 },
            sales: { some: saleFilter },
        },
        orderBy: { balance: "desc" },
        include: {
            sales: {
                where: { payment: { method: "CREDIT" } },
                include: {
                    payment: true,
                    debtPayments: true,
                },
                orderBy: { createdAt: "desc" },
            },
        },
    });

    return patients.map((p: any) => {
        const unpaidSales = p.sales.filter((s: any) => {
            const paid = s.debtPayments.reduce((sum: any, dp: any) => sum + dp.amount, 0);
            return paid < s.total - s.discount;
        });
        // sales are ordered desc, so oldest unpaid is last in the filtered array
        const oldestUnpaidDate = unpaidSales.length > 0
            ? unpaidSales[unpaidSales.length - 1].createdAt
            : null;
        return {
            id: p.id,
            name: p.name,
            phone: p.phone,
            balance: p.balance,
            unpaidSalesCount: unpaidSales.length,
            lastSaleDate: p.sales[0]?.createdAt || null,
            oldestUnpaidDate,
        };
    });
}

// ... unchanged getPatientDebts ...

// إحصائيات الديون
export async function getDebtStats(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) {
        return { totalDebt: 0, debtorCount: 0, todayPaymentsAmount: 0, todayPaymentsCount: 0 };
    }
    const { user, organizationId } = tenantCtx;

    // Filter patients by SALE branch (not patient.branchId) to include null-branchId patients
    const saleFilter: any = { payment: { method: 'CREDIT' } };
    if (branchId) {
        saleFilter.branchId = branchId;
    } else if (user.role === 'ADMIN' && organizationId) {
        saleFilter.branch = { organizationId };
    } else if (user.branchId) {
        saleFilter.branchId = user.branchId;
    }

    const wherePatients: any = {
        balance: { gt: 0 },
        sales: { some: saleFilter },
    };

    // For today's payments: scope via the sale's branch
    const saleBranchFilter: any = {};
    if (branchId) {
        saleBranchFilter.branchId = branchId;
    } else if (user.role === 'ADMIN' && organizationId) {
        saleBranchFilter.branch = { organizationId };
    } else if (user.branchId) {
        saleBranchFilter.branchId = user.branchId;
    }

    const wherePayments: any = {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        sale: saleBranchFilter,
    };

    const [totalDebt, debtorCount, todayPayments] = await Promise.all([
        prisma.patient.aggregate({
            where: wherePatients,
            _sum: { balance: true },
        }),
        prisma.patient.count({
            where: wherePatients,
        }),
        prisma.debtPayment.aggregate({
            where: wherePayments,
            _sum: { amount: true },
            _count: true,
        }),
    ]);

    return {
        totalDebt: totalDebt._sum.balance || 0,
        debtorCount,
        todayPaymentsAmount: todayPayments._sum.amount || 0,
        todayPaymentsCount: todayPayments._count || 0,
    };
}

// جلب ديون مريض معين مع كشف حساب
export async function getPatientDebts(patientId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const patient = await prisma.patient.findUnique({
        where: { id: patientId, ...tenantBranchWhere },
        include: {
            sales: {
                where: {
                    payment: { method: "CREDIT" },
                },
                include: {
                    payment: true,
                    items: { include: { drug: true } },
                    debtPayments: {
                        orderBy: { createdAt: "desc" },
                    },
                },
                orderBy: { createdAt: "desc" },
            },
        },
    });

    if (!patient) return null;

    const sales = patient.sales.map((s: any) => {
        const totalPaid = s.debtPayments.reduce((sum: any, dp: any) => sum + dp.amount, 0);
        const remaining = s.total - s.discount - totalPaid;
        return {
            id: s.id,
            total: s.total,
            discount: s.discount,
            remaining: Math.max(0, remaining),
            totalPaid,
            isPaid: remaining <= 0,
            createdAt: s.createdAt,
            items: s.items.map((i: any) => ({
                name: i.drug.tradeName,
                quantity: i.quantity,
                price: i.price,
            })),
            payments: s.debtPayments,
        };
    });

    return {
        patient: {
            id: patient.id,
            name: patient.name,
            phone: patient.phone,
            balance: patient.balance,
        },
        sales,
    };
}

// سجل التسديدات الأخيرة
export async function getRecentDebtPayments(branchId?: string, limit = 30) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    const wherePayments: any = {
        sale: {
            patient: { ...tenantBranchWhere },
        },
    };

    if (branchId) {
        wherePayments.sale.patient.branchId = branchId;
    }

    const payments = await prisma.debtPayment.findMany({
        where: wherePayments,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
            sale: {
                include: {
                    patient: { select: { id: true, name: true, phone: true } },
                },
            },
        },
    });

    return payments.map((p: any) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        note: p.note,
        createdAt: p.createdAt,
        patientId: p.sale.patient?.id,
        patientName: p.sale.patient?.name || "—",
        patientPhone: p.sale.patient?.phone || "",
    }));
}

// تسجيل دفعة على دين
export async function makeDebtPayment(
    saleId: string,
    patientId: string,
    amount: number,
    method: string = "CASH",
    note?: string,
    safeId?: string
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return { success: false, message: "غير مصرح" };

        const { organizationId } = tenantCtx;

        const sale = await prisma.sale.findFirst({
            where: { id: saleId, patient: { id: patientId, ...tenantCtx.tenantBranchWhere } },
            include: { payment: true, debtPayments: true, patient: true },
        });

        if (!sale || sale.patientId !== patientId) {
            return { success: false, message: "الفاتورة غير موجودة أو لا تخص هذا العميل" };
        }

        const totalPaid = sale.debtPayments.reduce((sum: any, dp: any) => sum + dp.amount, 0);
        const remaining = sale.total - sale.discount - totalPaid;

        if (amount > remaining + 1) {
            return { success: false, message: `المبلغ أكبر من المتبقي (${remaining})` };
        }

        const finalAmount = Math.min(amount, remaining);

        await prisma.$transaction([
            prisma.debtPayment.create({
                data: {
                    saleId,
                    amount: finalAmount,
                    method: method as any,
                    note: note || null,
                },
            }),
            prisma.patient.update({
                where: { id: patientId },
                data: { balance: { decrement: finalAmount } },
            }),
            ...(finalAmount >= remaining
                ? [
                    prisma.payment.update({
                        where: { saleId },
                        data: { status: "COMPLETED" },
                    }),
                ]
                : []),
            ...(safeId
                ? [
                    prisma.safe.update({
                        where: { id: safeId },
                        data: { balance: { increment: finalAmount } },
                    }),
                    prisma.transaction.create({
                        data: {
                            safeId,
                            type: "IN",
                            amount: finalAmount,
                            referenceType: "CUSTOMER_RECEIPT",
                            description: note || `تسديد دفعة من ديون الفاتورة - العميل ${sale.patient?.name}`,
                        }
                    })
                ]
                : [])
        ]);

        // Revalidate immediately after the payment is committed — BEFORE any
        // non-critical side-effects that could throw and mask the success.
        revalidatePath("/dashboard/debts");
        revalidatePath(`/dashboard/debts/${patientId}`);

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'DEBT',
            entityId: saleId,
            details: JSON.stringify({ patientId, amount: finalAmount, method }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });

        // Loyalty System Logic (Earn points on debt payment)
        // Non-critical: a loyalty failure must NOT roll back or hide the payment.
        try {
            const settings = await prisma.companySettings.findFirst({
                where: { organizationId: organizationId ?? undefined },
            });
            if (settings?.loyaltyEnabled && finalAmount > 0) {
                const pointsPerDinar = settings.loyaltyPointsPerDinar || 0.01;
                const pointsEarned = Math.floor(finalAmount * pointsPerDinar);

                if (pointsEarned > 0) {
                    let loyaltyAccount = await prisma.loyaltyAccount.findUnique({
                        where: { patientId: patientId }
                    });

                    if (!loyaltyAccount) {
                        loyaltyAccount = await prisma.loyaltyAccount.create({
                            data: { patientId: patientId }
                        });
                    }

                    const newLifetime = loyaltyAccount.lifetimePoints + pointsEarned;
                    const newTotal = loyaltyAccount.totalPoints + pointsEarned;
                    let newTier = "BRONZE";
                    if (newLifetime >= 20000) newTier = "GOLD";
                    else if (newLifetime >= 5000) newTier = "SILVER";

                    await prisma.loyaltyAccount.update({
                        where: { id: loyaltyAccount.id },
                        data: {
                            totalPoints: newTotal,
                            lifetimePoints: newLifetime,
                            tier: newTier
                        }
                    });

                    await prisma.loyaltyTransaction.create({
                        data: {
                            accountId: loyaltyAccount.id,
                            type: "EARN",
                            points: pointsEarned,
                            saleId: saleId,
                            description: "نقاط مكتسبة من تسديد دين"
                        }
                    });
                }
            }
        } catch (loyaltyError) {
            console.error("makeDebtPayment: loyalty system error (non-critical):", loyaltyError);
        }

        return { success: true };
    } catch (error: any) {
        console.error("Debt payment error:", error);
        return { success: false, message: error.message };
    }
}


