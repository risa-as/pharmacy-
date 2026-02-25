'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';

// ===================== كشف حساب المورد =====================

/**
 * جلب قائمة الموردين مع الأرصدة
 */
export async function getSuppliersWithBalances() {
    const suppliers = await prisma.supplier.findMany({
        include: {
            _count: { select: { purchases: true, payments: true } },
        },
        orderBy: { name: 'asc' }
    });

    return suppliers.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        balance: s.balance,
        purchaseCount: s._count.purchases,
        paymentCount: s._count.payments,
    }));
}

/**
 * ملخص مورد واحد
 */
export async function getSupplierSummary(supplierId: string) {
    const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
    });

    if (!supplier) return null;

    // إجمالي المشتريات المكتملة
    const totalPurchases = await prisma.purchase.aggregate({
        where: { supplierId, status: 'COMPLETED' },
        _sum: { total: true, paidAmount: true },
        _count: true,
    });

    // إجمالي الدفعات
    const totalPayments = await prisma.supplierPayment.aggregate({
        where: { supplierId },
        _sum: { amount: true },
        _count: true,
    });

    return {
        supplier,
        totalPurchased: totalPurchases._sum.total || 0,
        totalPaidOnPurchases: totalPurchases._sum.paidAmount || 0,
        purchaseCount: totalPurchases._count,
        totalPayments: totalPayments._sum.amount || 0,
        paymentCount: totalPayments._count,
        balance: supplier.balance,
    };
}

/**
 * كشف حساب كامل (حركات مرتبة بالتاريخ)
 */
export async function getSupplierLedger(supplierId: string) {
    // مشتريات مكتملة
    const purchases = await prisma.purchase.findMany({
        where: { supplierId, status: 'COMPLETED' },
        include: { branch: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
    });

    // دفعات
    const payments = await prisma.supplierPayment.findMany({
        where: { supplierId },
        include: { branch: { select: { name: true } } },
        orderBy: { date: 'desc' },
    });

    // دمج وترتيب بالتاريخ
    type LedgerEntry = {
        id: string;
        type: 'purchase' | 'payment';
        date: Date;
        amount: number;
        description: string;
        branch: string;
        reference?: string | null;
        method?: string;
        runningBalance?: number;
    };

    const entries: LedgerEntry[] = [
        ...purchases.map(p => ({
            id: p.id,
            type: 'purchase' as const,
            date: p.createdAt,
            amount: p.total,
            description: `فاتورة شراء ${p.invoiceNumber || '#' + p.id.slice(0, 8)}`,
            branch: p.branch?.name || '',
            reference: p.invoiceNumber,
        })),
        ...payments.map(p => ({
            id: p.id,
            type: 'payment' as const,
            date: p.date,
            amount: p.amount,
            description: p.notes || `دفعة ${p.method === 'CASH' ? 'نقدي' : p.method === 'CHECK' ? 'شيك' : 'حوالة'}`,
            branch: p.branch?.name || '',
            reference: p.reference,
            method: p.method,
        })),
    ];

    // ترتيب بالتاريخ (الأقدم أولاً لحساب الرصيد التراكمي)
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // حساب الرصيد التراكمي
    let running = 0;
    for (const entry of entries) {
        if (entry.type === 'purchase') {
            running += entry.amount;
        } else {
            running -= entry.amount;
        }
        entry.runningBalance = Math.round(running * 100) / 100;
    }

    // عكس الترتيب (الأحدث أولاً) للعرض
    entries.reverse();

    return entries;
}

/**
 * تسجيل دفعة مورد
 */
export async function recordSupplierPayment(data: {
    supplierId: string;
    branchId: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    date?: string;
}) {
    try {
        const { supplierId, branchId, amount, method, reference, notes, date } = data;

        if (amount <= 0) {
            return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };
        }

        // التأكد من وجود المورد
        const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
        if (!supplier) {
            return { success: false, error: 'المورد غير موجود' };
        }

        await prisma.$transaction(async (tx) => {
            // 1. تسجيل الدفعة
            await tx.supplierPayment.create({
                data: {
                    supplierId,
                    branchId,
                    amount,
                    method: method || 'CASH',
                    reference: reference || null,
                    notes: notes || null,
                    date: date ? new Date(date) : new Date(),
                },
            });

            // 2. تحديث رصيد المورد
            await tx.supplier.update({
                where: { id: supplierId },
                data: { balance: { decrement: amount } },
            });
        });

        revalidatePath(`/dashboard/suppliers/${supplierId}`);
        revalidatePath('/dashboard/suppliers');
        return { success: true };
    } catch (error) {
        console.error('Record Supplier Payment Error:', error);
        return { success: false, error: 'فشل في تسجيل الدفعة' };
    }
}

/**
 * إعادة حساب رصيد المورد (في حالة عدم التطابق)
 */
export async function recalculateSupplierBalance(supplierId: string) {
    const purchases = await prisma.purchase.aggregate({
        where: { supplierId, status: 'COMPLETED' },
        _sum: { total: true },
    });

    const payments = await prisma.supplierPayment.aggregate({
        where: { supplierId },
        _sum: { amount: true },
    });

    const correctBalance = (purchases._sum.total || 0) - (payments._sum.amount || 0);

    await prisma.supplier.update({
        where: { id: supplierId },
        data: { balance: Math.round(correctBalance * 100) / 100 },
    });

    revalidatePath(`/dashboard/suppliers/${supplierId}`);
    return correctBalance;
}
