"use server";

import { prisma } from "@/app/lib/prisma";
import { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

// إنشاء دفعة جديدة
export async function createPayment(
    saleId: string,
    amount: number,
    method: PaymentMethod,
    referenceNumber?: string
) {
    try {
        const payment = await prisma.payment.create({
            data: {
                saleId,
                amount,
                method,
                referenceNumber: referenceNumber || null,
                status: "COMPLETED",
            },
        });

        revalidatePath("/dashboard/sales");
        revalidatePath("/dashboard/payments");
        return { success: true, payment };
    } catch (error) {
        console.error(error);
        return { message: "حدث خطأ أثناء تسجيل الدفعة" };
    }
}

// استرجاع دفعة
export async function refundPayment(paymentId: string) {
    try {
        await prisma.payment.update({
            where: { id: paymentId },
            data: { status: "REFUNDED" },
        });

        revalidatePath("/dashboard/sales");
        revalidatePath("/dashboard/payments");
        return { success: true };
    } catch (error) {
        return { message: "حدث خطأ أثناء استرجاع الدفعة" };
    }
}

// جلب تفاصيل دفعة
export async function getPaymentBySaleId(saleId: string) {
    return await prisma.payment.findUnique({
        where: { saleId },
    });
}

// جلب إحصائيات الدفع
export async function getPaymentStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalCash, totalCard, totalMobile, totalTransfer, totalZainCash] = await Promise.all([
        prisma.payment.aggregate({
            where: { method: "CASH", status: "COMPLETED", createdAt: { gte: today } },
            _sum: { amount: true },
        }),
        prisma.payment.aggregate({
            where: { method: "CARD", status: "COMPLETED", createdAt: { gte: today } },
            _sum: { amount: true },
        }),
        prisma.payment.aggregate({
            where: { method: "MOBILE_WALLET", status: "COMPLETED", createdAt: { gte: today } },
            _sum: { amount: true },
        }),
        prisma.payment.aggregate({
            where: { method: "BANK_TRANSFER", status: "COMPLETED", createdAt: { gte: today } },
            _sum: { amount: true },
        }),
        prisma.payment.aggregate({
            where: { method: "ZAIN_CASH", status: "COMPLETED", createdAt: { gte: today } },
            _sum: { amount: true },
        }),
    ]);

    return {
        cash: totalCash._sum.amount || 0,
        card: totalCard._sum.amount || 0,
        mobile: totalMobile._sum.amount || 0,
        transfer: totalTransfer._sum.amount || 0,
        zainCash: totalZainCash._sum.amount || 0,
    };
}
