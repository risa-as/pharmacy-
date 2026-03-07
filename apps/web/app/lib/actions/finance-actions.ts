'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';

// --- Safes ---

export async function getSafes(branchId: string) {
    return await prisma.safe.findMany({
        where: { branchId },
        orderBy: { name: 'asc' }
    });
}

export async function getSafesForOrg(organizationId: string) {
    return await prisma.safe.findMany({
        where: { branch: { organizationId } },
        orderBy: { name: 'asc' }
    });
}

export async function createSafe(branchId: string, data: { name: string, type: string, initialBalance?: number }) {
    try {
        const safe = await prisma.safe.create({
            data: {
                branchId,
                name: data.name,
                type: data.type,
                balance: data.initialBalance || 0
            }
        });

        // If there is an initial balance, log it as a transaction
        if (safe.balance > 0) {
            await prisma.transaction.create({
                data: {
                    safeId: safe.id,
                    type: 'IN',
                    amount: safe.balance,
                    referenceType: 'VOUCHER',
                    description: 'الرصيد الافتتاحي'
                }
            });
        }

        revalidatePath('/dashboard/finance/safes');
        return { success: true, safe };
    } catch (error) {
        console.error('Create Safe Error:', error);
        return { success: false, error: 'فشل في إضافة الصندوق. يرجى المحاولة مرة أخرى.' };
    }
}

export async function deleteSafe(id: string) {
    try {
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
    return await prisma.transaction.findMany({
        where: { safeId },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getBranchTransactions(branchId: string) {
    return await prisma.transaction.findMany({
        where: { safe: { branchId } },
        include: { safe: true },
        orderBy: { createdAt: 'desc' }
    });
}

export async function createTransaction(data: { safeId: string, type: 'IN' | 'OUT', amount: number, referenceType: string, description?: string }) {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const safe = await tx.safe.findUnique({ where: { id: data.safeId } });
            if (!safe) throw new Error('Safe not found');

            // Prevent negative balance for OUT transactions if necessary, though some businesses allow overdraft
            // if (data.type === 'OUT' && safe.balance < data.amount) throw new Error('Insufficient funds');

            // Update safe balance
            const newBalance = data.type === 'IN' ? safe.balance + data.amount : safe.balance - data.amount;

            await tx.safe.update({
                where: { id: safe.id },
                data: { balance: newBalance }
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
        const result = await prisma.$transaction(async (tx) => {
            const fromSafe = await tx.safe.findUnique({ where: { id: data.fromSafeId } });
            const toSafe = await tx.safe.findUnique({ where: { id: data.toSafeId } });

            if (!fromSafe || !toSafe) throw new Error('Safe not found');
            if (fromSafe.balance < data.amount) throw new Error('رصيد الصندوق المحول منه غير كافٍ.');

            // Deduct from Source
            await tx.safe.update({
                where: { id: fromSafe.id },
                data: { balance: { decrement: data.amount } }
            });

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
