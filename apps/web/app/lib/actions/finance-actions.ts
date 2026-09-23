'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireActionTenant } from '../action-tenant';

// --- Safes ---

export async function getSafes(branchId: string) {
    const ctx = await requireActionTenant('canViewDebts', 'read');
    return await prisma.safe.findMany({
        where: { AND: [ctx.tenantBranchWhere, { branchId }] },
        orderBy: { name: 'asc' }
    });
}

export async function getSafesForOrg(organizationId: string) {
    const ctx = await requireActionTenant('canViewDebts', 'read');
    return await prisma.safe.findMany({
        where: { AND: [ctx.tenantBranchWhere, { branch: { organizationId } }] },
        orderBy: { name: 'asc' }
    });
}

export async function createSafe(branchId: string, data: { name: string, type: string, initialBalance?: number }) {
    try {
        const ctx = await requireActionTenant('canChangeSettings');
        if (!await prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id: branchId }] } })) throw new Error('الفرع خارج النطاق');
        if (!Number.isFinite(data.initialBalance ?? 0) || (data.initialBalance ?? 0) < 0) throw new Error('رصيد غير صالح');
        const safe = await prisma.$transaction(async tx => {
        const safe = await tx.safe.create({
            data: {
                branchId,
                name: data.name,
                type: data.type,
                balance: data.initialBalance || 0
            }
        });

        // If there is an initial balance, log it as a transaction
        if (safe.balance > 0) {
            await tx.transaction.create({
                data: {
                    safeId: safe.id,
                    type: 'IN',
                    amount: safe.balance,
                    referenceType: 'VOUCHER',
                    description: 'الرصيد الافتتاحي'
                }
            });
        }
        return safe;
        });

        revalidatePath('/dashboard/finance/safes');
        return { success: true, safe };
    } catch (error) {
        console.error('Create Safe Error:', error);
        return { success: false, error: 'فشل في إضافة الصندوق. يرجى المحاولة مرة أخرى.' };
    }
}

export async function deleteSafe(id: string) {
    try {
        const ctx = await requireActionTenant('canChangeSettings');
        if (!await prisma.safe.findFirst({ where: { AND: [ctx.tenantBranchWhere, { id, balance: 0 }] } })) throw new Error('الصندوق خارج النطاق أو رصيده غير صفري');
        // Can only delete if balance is 0 and no transactions/relations exist (Prisma will throw error otherwise)
        await prisma.safe.delete({ where: { id } });
        revalidatePath('/dashboard/finance/safes');
        return { success: true };
    } catch (error) {
        console.error('Delete Safe Error:', error);
        return { success: false, error: 'لا يمكن حذف الصندوق لوجود حركات مالية مرتبطة به.' };
    }
}

// --- Transactions ---

export async function getTransactions(safeId: string) {
    const ctx = await requireActionTenant('canViewReports', 'read');
    return await prisma.transaction.findMany({
        where: { safeId, safe: ctx.tenantBranchWhere },
        orderBy: { createdAt: 'desc' }
    });
}


export async function createTransaction(data: { safeId: string, type: 'IN' | 'OUT', amount: number, referenceType: string, description?: string }) {
    try {
        const ctx = await requireActionTenant('canCreateExpense');
        if (!Number.isFinite(data.amount) || data.amount <= 0 || !['IN', 'OUT'].includes(data.type)) throw new Error('حركة غير صالحة');
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const safe = await tx.safe.findFirst({ where: { AND: [ctx.tenantBranchWhere, { id: data.safeId }] } });
            if (!safe) throw new Error('Safe not found');

            // Prevent negative balance for OUT transactions if necessary, though some businesses allow overdraft
            // if (data.type === 'OUT' && safe.balance < data.amount) throw new Error('Insufficient funds');

            // Increment atomically so concurrent vouchers do not lose updates.
            await tx.safe.update({
                where: { id: safe.id },
                data: { balance: { increment: data.type === 'IN' ? data.amount : -data.amount } }
            });

            // Log transaction
            const transaction = await tx.transaction.create({
                data: {
                    safeId: data.safeId,
                    type: data.type,
                    amount: data.amount,
                    referenceType: data.referenceType,
                    description: data.description || (data.type === 'IN' ? 'سند قبض' : 'سند صرف')
                }
            });

            return transaction;
        });

        revalidatePath('/dashboard/finance/safes');
        return { success: true, transaction: result };
    } catch (error) {
        console.error('Create Transaction Error:', error);
        return { success: false, error: 'فشل في تسجيل الحركة المالية.' };
    }
}

export async function transferFunds(data: { fromSafeId: string, toSafeId: string, amount: number, description?: string }) {
    try {
        const ctx = await requireActionTenant('canCreateExpense');
        if (!Number.isFinite(data.amount) || data.amount <= 0 || data.fromSafeId === data.toSafeId) throw new Error('تحويل غير صالح');
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const fromSafe = await tx.safe.findFirst({ where: { AND: [ctx.tenantBranchWhere, { id: data.fromSafeId }] } });
            const toSafe = await tx.safe.findFirst({ where: { AND: [ctx.tenantBranchWhere, { id: data.toSafeId }] } });

            if (!fromSafe || !toSafe) throw new Error('Safe not found');
            if (fromSafe.balance < data.amount) throw new Error('رصيد الصندوق المحول منه غير كافٍ.');

            // Deduct from Source
            const deducted = await tx.safe.updateMany({
                where: { id: fromSafe.id, balance: { gte: data.amount } },
                data: { balance: { decrement: data.amount } }
            });
            if (deducted.count !== 1) throw new Error('رصيد الصندوق المحول منه غير كافٍ.');

            await tx.transaction.create({
                data: {
                    safeId: fromSafe.id,
                    type: 'OUT',
                    amount: data.amount,
                    referenceType: 'TRANSFER',
                    description: data.description || `تحويل إلى ${toSafe.name}`
                }
            });

            // Add to Destination
            await tx.safe.update({
                where: { id: toSafe.id },
                data: { balance: { increment: data.amount } }
            });

            await tx.transaction.create({
                data: {
                    safeId: toSafe.id,
                    type: 'IN',
                    amount: data.amount,
                    referenceType: 'TRANSFER',
                    description: data.description || `استلام مش تحويل من ${fromSafe.name}`
                }
            });

            return true;
        });

        revalidatePath('/dashboard/finance/safes');
        return { success: true };
    } catch (error: any) {
        console.error('Transfer Funds Error:', error);
        return { success: false, error: error?.message || 'فشل في إجراء التحويل الداخلي.' };
    }
}
