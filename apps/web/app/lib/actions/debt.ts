"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

// جلب جميع المدينين
export async function getAllDebtors(branchId?: string) {
    const whereClause: any = { balance: { gt: 0 } };
    if (branchId) {
        whereClause.branchId = branchId;
    }

    const patients = await prisma.patient.findMany({
        where: whereClause,
        orderBy: { balance: "desc" },
        include: {
            sales: {
                where: {
                    payment: { method: "CREDIT" },
                },
                include: {
                    payment: true,
                    debtPayments: true,
                },
                orderBy: { createdAt: "desc" },
            },
        },
    });

    return patients.map((p) => {
        const unpaidSales = p.sales.filter((s) => {
            const paid = s.debtPayments.reduce((sum, dp) => sum + dp.amount, 0);
            return paid < s.total - s.discount;
        });
        return {
            id: p.id,
            name: p.name,
            phone: p.phone,
            balance: p.balance,
            unpaidSalesCount: unpaidSales.length,
            lastSaleDate: p.sales[0]?.createdAt || null,
        };
    });
}

// ... unchanged getPatientDebts ...

// إحصائيات الديون
export async function getDebtStats(branchId?: string) {
    const wherePatients: any = { balance: { gt: 0 } };
    const wherePayments: any = {
        createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
    };

    if (branchId) {
        wherePatients.branchId = branchId;
        // For payments, we need to filter by the sale's branch or the patient's branch
        // Assuming DebtPayment -> Sale -> User (who has branchId) or Patient (who has branchId)
        // In our schema: DebtPayment -> Sale. Sale -> User (maybe null) or Patient (maybe null).
        // Best proxy is Sale's branch or Patient's branch.
        // Let's check schema/relationship. DebtPayment -> Sale.
        // We can filter debt payments by: Sale.Patient.branchId OR Sale.User.branchId?
        // Simpler: Filter by Sale's Patient Branch ID if available, or just rely on Patient stats.

        // Actually, let's filter DebtPayment by `sale: { patient: { branchId } }`
        wherePayments.sale = {
            patient: {
                branchId: branchId
            }
        };
    }

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
    const patient = await prisma.patient.findUnique({
        where: { id: patientId },
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

    const sales = patient.sales.map((s) => {
        const totalPaid = s.debtPayments.reduce((sum, dp) => sum + dp.amount, 0);
        const remaining = s.total - s.discount - totalPaid;
        return {
            id: s.id,
            total: s.total,
            discount: s.discount,
            remaining: Math.max(0, remaining),
            totalPaid,
            isPaid: remaining <= 0,
            createdAt: s.createdAt,
            items: s.items.map((i) => ({
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
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: { payment: true, debtPayments: true, patient: true },
        });

        if (!sale || sale.patientId !== patientId) {
            return { success: false, message: "الفاتورة غير موجودة أو لا تخص هذا العميل" };
        }

        const totalPaid = sale.debtPayments.reduce((sum, dp) => sum + dp.amount, 0);
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

        // Loyalty System Logic (Earn points on debt payment)
        // Non-critical: a loyalty failure must NOT roll back or hide the payment.
        try {
            const settings = await prisma.companySettings.findFirst();
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


