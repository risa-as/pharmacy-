import { Prisma } from '@prisma/client';
'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';

/**
 * Supplier data needs canViewSuppliers. Paying a supplier also needs
 * canPaySupplier. The opening balance and a balance recalculation are
 * administrative corrections: owner or manager only, not grantable per user.
 * These functions can be called directly as server actions, so the checks live
 * here, not only in the routes and pages that call them.
 */
const MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);
async function supplierContext(access: 'read' | 'write', need: 'view' | 'pay' | 'manage' = 'view') {
    const tenantCtx = await getTenantContext(access);
    if (tenantCtx instanceof NextResponse) return null;
    const p = tenantCtx.userPermissions;
    if (!p.canViewSuppliers) return null;
    if (need === 'pay' && !p.canPaySupplier) return null;
    if (need === 'manage' && !MANAGER_ROLES.has(tenantCtx.user.role)) return null;
    return tenantCtx;
}
/** A branch the caller may act for: their own, or any of their organisation's for admins. */
async function branchInScope(tenantCtx: { branchModelWhere: Record<string, any> }, branchId: unknown) {
    return typeof branchId === 'string' && !!branchId
        && !!await prisma.branch.findFirst({ where: { AND: [tenantCtx.branchModelWhere, { id: branchId }] }, select: { id: true } });
}

/** Only cash leaves a drawer; a cheque or a transfer does not move any safe. */
const SUPPLIER_PAYMENT_METHODS = ['CASH', 'CHECK', 'TRANSFER'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class SupplierPaymentRefused extends Error {}

// ===================== كشف حساب المورد =====================

/**
 * جلب قائمة الموردين مع الأرصدة
 */
export async function getSuppliersWithBalances() {
    const tenantCtx = await supplierContext('read');
    if (!tenantCtx) return [];

    const suppliers = await prisma.supplier.findMany({
        where: tenantCtx.organizationId ? { organizationId: tenantCtx.organizationId } : {},
        include: {
            _count: { select: { purchases: true, payments: true } },
        },
        orderBy: { name: 'asc' }
    });

    return suppliers.map((s: any) => ({
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
    const tenantCtx = await supplierContext('read');
    if (!tenantCtx) return null;

    const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId, organizationId: tenantCtx.organizationId || undefined },
    });

    if (!supplier) return null;

    // إجمالي المشتريات المكتملة (scoped to org branches)
    const orgBranchIds = await prisma.branch
        .findMany({ where: { organizationId: tenantCtx.organizationId || '' }, select: { id: true } })
        .then((bs: any[]) => bs.map((b: any) => b.id));

    const totalPurchases = await prisma.purchase.aggregate({
        where: { supplierId, status: 'COMPLETED', branchId: { in: orgBranchIds } },
        _sum: { total: true, paidAmount: true },
        _count: true,
    });

    // إجمالي الدفعات (scoped to org branches)
    const totalPayments = await prisma.supplierPayment.aggregate({
        where: { supplierId, branchId: { in: orgBranchIds } },
        _sum: { amount: true },
        _count: true,
    });

    return {
        supplier,
        totalPurchased: totalPurchases._sum.total || 0,
        totalPaidOnPurchases: totalPurchases._sum.paidAmount || 0,
        purchaseCount: totalPurchases._count,
        // Everything paid: separate payments plus what was paid when a purchase was received.
        totalPayments: (totalPayments._sum.amount || 0) + (totalPurchases._sum.paidAmount || 0),
        paymentCount: totalPayments._count,
        balance: supplier.balance,
    };
}

/**
 * كشف حساب كامل (حركات مرتبة بالتاريخ)
 */
export async function getSupplierLedger(supplierId: string) {
    const tenantCtx = await supplierContext('read');
    if (!tenantCtx) return [];

    const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId, organizationId: tenantCtx.organizationId || undefined },
    });
    if (!supplier) return [];

    // مشتريات مكتملة (scoped to org branches)
    const orgBranchIds = await prisma.branch
        .findMany({ where: { organizationId: tenantCtx.organizationId || '' }, select: { id: true } })
        .then((bs: any[]) => bs.map((b: any) => b.id));

    const purchases = await prisma.purchase.findMany({
        where: { supplierId, status: 'COMPLETED', branchId: { in: orgBranchIds } },
        include: { branch: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
    });

    // دفعات (scoped to org branches)
    const payments = await prisma.supplierPayment.findMany({
        where: { supplierId, branchId: { in: orgBranchIds } },
        include: { branch: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
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
        ...purchases.map((p: any) => ({
            id: p.id,
            type: 'purchase' as const,
            date: p.createdAt,
            amount: p.total,
            description: p.invoiceNumber === 'OPENING-BALANCE'
                ? `رصيد افتتاحي${p.signature ? ' — ' + p.signature : ''}`
                : `فاتورة شراء ${p.invoiceNumber || '#' + p.documentNumber}`,
            branch: p.branch?.name || '',
            reference: p.invoiceNumber === 'OPENING-BALANCE' ? null : p.invoiceNumber,
            isOpening: p.invoiceNumber === 'OPENING-BALANCE',
        })),
        // Paid when the purchase was received (isPaid): a credit against that purchase.
        ...purchases.filter((p: any) => p.paidAmount > 0).map((p: any) => ({
            id: `${p.id}:paid-at-receipt`,
            type: 'payment' as const,
            date: p.createdAt,
            amount: p.paidAmount,
            description: `مدفوع عند استلام فاتورة ${p.invoiceNumber || '#' + p.documentNumber}`,
            branch: p.branch?.name || '',
            reference: p.invoiceNumber,
        })),
        ...payments.map((p: any) => ({
            id: p.id,
            type: 'payment' as const,
            date: p.createdAt,
            amount: p.amount,
            description: p.notes || `دفعة ${p.method === 'CASH' ? 'نقدي' : p.method === 'CHECK' ? 'شيك' : 'حوالة'}`,
            branch: p.branch?.name || '',
            reference: p.reference,
            method: p.method,
        })),
    ];

    // ترتيب زمني صارم (الأقدم أولاً) لحساب الرصيد التراكمي بشكل صحيح
    entries.sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

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
    /** Drawer the cash leaves; required for CASH, ignored otherwise. */
    safeId?: string | null;
    /** Chosen once per payment by the form and resent on retry: a retry never pays twice. Required. */
    requestId: string;
    reference?: string;
    notes?: string;
    date?: string;
}) {
    const tenantCtx = await supplierContext('write', 'pay');
    if (!tenantCtx) return { success: false, error: 'غير مصرح' };

    try {
        const { supplierId, branchId, amount, reference, notes, date, requestId } = data;
        const method = data.method || 'CASH';
        if (!(SUPPLIER_PAYMENT_METHODS as readonly string[]).includes(method)) return { success: false, error: 'طريقة الدفع غير صالحة' };
        if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };
        if (typeof requestId !== 'string' || !UUID.test(requestId)) return { success: false, error: 'معرّف الطلب مطلوب وغير صالح' };
        if (!await branchInScope(tenantCtx, branchId)) return { success: false, error: 'الفرع خارج نطاق صلاحياتك' };

        // التأكد من وجود المورد وملكيته للمؤسسة
        const supplier = await prisma.supplier.findFirst({
            where: { id: supplierId, ...(tenantCtx.organizationId ? { organizationId: tenantCtx.organizationId } : {}) },
        });
        if (!supplier) {
            return { success: false, error: 'المورد غير موجود أو ليس لديك صلاحية' };
        }

        // Cash leaves a drawer of the chosen branch; nothing is created or guessed.
        const safeId = method === 'CASH' ? data.safeId || null : null;
        if (method === 'CASH') {
            if (!safeId) return { success: false, error: 'اختر الصندوق الذي يُدفع منه النقد' };
            if (!await prisma.safe.findFirst({ where: { id: safeId, branchId }, select: { id: true } }))
                return { success: false, error: 'الصندوق لا يتبع الفرع المختار' };
        }
        const samePayment = (p: { supplierId: string; branchId: string; amount: number; method: string; safeId: string | null }) =>
            p.supplierId === supplierId && p.branchId === branchId && p.amount === amount && p.method === method && (p.safeId ?? null) === safeId;

        const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Serialises a retry sent while the first attempt is still running.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'supplier-payment:' + requestId}, 0))::text`;
            const prior = await tx.supplierPayment.findUnique({ where: { id: requestId } });
            if (prior) return samePayment(prior) ? 'duplicate' : 'conflict';
            // Payment, supplier balance and drawer movement: all or nothing.
            const payment = await tx.supplierPayment.create({
                data: {
                    id: requestId,
                    supplierId,
                    branchId,
                    safeId,
                    amount,
                    method,
                    reference: reference || null,
                    notes: notes || null,
                    date: date ? new Date(date) : new Date(),
                },
            });
            await tx.supplier.update({
                where: { id: supplierId },
                data: { balance: { decrement: amount } },
            });
            if (safeId) {
                const deducted = await tx.safe.updateMany({
                    where: { id: safeId, balance: { gte: amount } },
                    data: { balance: { decrement: amount } },
                });
                if (deducted.count !== 1) throw new SupplierPaymentRefused('رصيد الصندوق غير كافٍ لهذه الدفعة.');
                await tx.transaction.create({
                    data: {
                        safeId,
                        type: 'OUT',
                        amount,
                        referenceType: 'SUPPLIER_PAYMENT',
                        referenceId: payment.id,
                        userId: tenantCtx.user.id,
                        description: `دفعة نقدية للمورد ${supplier.name}`,
                    },
                });
            }
            return 'created';
        });
        if (outcome === 'conflict') return { success: false, code: 'REQUEST_CONFLICT', error: 'سُجّلت دفعة سابقة بهذا الطلب ببيانات مختلفة؛ راجع كشف الحساب قبل الدفع مجدداً.' };
        if (outcome === 'duplicate') return { success: true, duplicate: true };

        // The payment is committed: a failure from here on must not report it as failed.
        try {
            await logAudit({
                userId: tenantCtx.user.id,
                userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
                action: 'CREATE',
                entity: 'SUPPLIER_PAYMENT',
                details: JSON.stringify({ supplierId, amount, method, safeId }),
                branchId,
            });
            revalidatePath(`/dashboard/suppliers/${supplierId}`);
            revalidatePath('/dashboard/suppliers');
            revalidatePath('/dashboard/finance/safes');
        } catch (error) {
            console.error('Supplier payment recorded; follow-up step failed:', error);
        }
        return { success: true };
    } catch (error) {
        if (error instanceof SupplierPaymentRefused) return { success: false, error: error.message };
        console.error('Record Supplier Payment Error:', error);
        return { success: false, error: 'فشل في تسجيل الدفعة' };
    }
}

/**
 * Whether a payment attempt (by its request id) was recorded: lets the form
 * settle an attempt whose response was lost, instead of paying again.
 * - recorded: a payment with this id exists in the caller's scope;
 * - not_recorded: the caller may see it and it does not exist;
 * - unknown: the caller cannot verify (no session or permission): keep the attempt.
 */
export async function getSupplierPaymentStatus(requestId: string): Promise<
    { status: 'recorded'; amount: number; method: string } | { status: 'not_recorded' } | { status: 'unknown' }> {
    const tenantCtx = await supplierContext('read', 'pay');
    if (!tenantCtx) return { status: 'unknown' };
    if (typeof requestId !== 'string' || !UUID.test(requestId)) return { status: 'not_recorded' };
    const payment = await prisma.supplierPayment.findFirst({
        where: {
            id: requestId,
            // Organisation, not branch: an employee moved to another branch still sees
            // their earlier attempt as recorded instead of paying it again.
            ...(tenantCtx.organizationId ? { supplier: { organizationId: tenantCtx.organizationId } } : {}),
        },
        select: { amount: true, method: true },
    });
    return payment ? { status: 'recorded', amount: payment.amount, method: payment.method } : { status: 'not_recorded' };
}

/**
 * تسجيل رصيد افتتاحي للمورد
 */
export async function setSupplierOpeningBalance(data: {
    supplierId: string;
    branchId: string;
    amount: number;
    notes?: string;
}) {
    const tenantCtx = await supplierContext('write', 'manage');
    if (!tenantCtx) return { success: false, error: 'غير مصرح' };

    const { supplierId, branchId, amount, notes } = data;
    if (!await branchInScope(tenantCtx, branchId)) return { success: false, error: 'الفرع خارج نطاق صلاحياتك' };

    if (amount <= 0)
        return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

    const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId, organizationId: tenantCtx.organizationId || undefined },
    });
    if (!supplier) return { success: false, error: 'المورد غير موجود' };

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // سجل في جدول المشتريات كـ"رصيد افتتاحي" حتى يظهر في كشف الحساب
            await tx.purchase.create({
                data: {
                    supplierId,
                    branchId,
                    total: amount,
                    paidAmount: 0,
                    status: 'COMPLETED',
                    invoiceNumber: 'OPENING-BALANCE',
                    signature: notes || null,
                },
            });
            // تحديث رصيد المورد
            await tx.supplier.update({
                where: { id: supplierId },
                data: { balance: { increment: amount } },
            });
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'SUPPLIER_PAYMENT',
            details: JSON.stringify({ supplierId, amount, type: 'OPENING_BALANCE' }),
            branchId,
        });

        revalidatePath(`/dashboard/suppliers/${supplierId}`);
        revalidatePath('/dashboard/suppliers');
        return { success: true };
    } catch (error) {
        console.error('Opening Balance Error:', error);
        return { success: false, error: 'فشل في تسجيل الرصيد الافتتاحي' };
    }
}

/**
 * إعادة حساب رصيد المورد (في حالة عدم التطابق)
 */
export async function recalculateSupplierBalance(supplierId: string) {
    const tenantCtx = await supplierContext('write', 'manage');
    if (!tenantCtx) return 0;

    const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId, organizationId: tenantCtx.organizationId || undefined }
    });
    if (!supplier) return 0;

    const purchases = await prisma.purchase.aggregate({
        where: { supplierId, status: 'COMPLETED' },
        _sum: { total: true, paidAmount: true },
    });

    const payments = await prisma.supplierPayment.aggregate({
        where: { supplierId },
        _sum: { amount: true },
    });

    // Owed = purchases − what was paid at receipt − separate payments (receipt adds only the unpaid part).
    const correctBalance = (purchases._sum.total || 0) - (purchases._sum.paidAmount || 0) - (payments._sum.amount || 0);

    await prisma.supplier.update({
        where: { id: supplierId },
        data: { balance: Math.round(correctBalance * 100) / 100 },
    });

    revalidatePath(`/dashboard/suppliers/${supplierId}`);
    return correctBalance;
}
