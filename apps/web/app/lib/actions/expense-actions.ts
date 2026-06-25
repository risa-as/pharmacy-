'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';

export async function getExpenses(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];

    const { user, organizationId } = tenantCtx;

    // Scope: branch-level for non-admins, org-level for admins
    const where: any = user.branchId
        ? { branchId: user.branchId }
        : organizationId
        ? { branch: { organizationId } }
        : {};

    // Optional branch narrowing (org admins filtering a specific branch)
    if (branchId) where.branchId = branchId;

    return await prisma.expense.findMany({
        where,
        include: { branch: { select: { name: true } } },
        orderBy: { date: 'desc' }
    });
}

export async function createExpense(data: { amount: number, category: string, description?: string, date?: Date }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, error: 'غير مصرح' };
    if (!tenantCtx.userPermissions.canCreateExpense) return { success: false, error: 'ليس لديك صلاحية لإنشاء مصروفات.' };

    const { user } = tenantCtx;

    if (!user.branchId) {
        return { success: false, error: 'لا يمكن تسجيل مصروف بدون تحديد فرع. يرجى التأكد من ربط حسابك بفرع.' };
    }

    try {
        const expense = await prisma.expense.create({
            data: {
                branchId: user.branchId,
                amount: data.amount,
                category: data.category,
                description: data.description,
                date: data.date || new Date()
            }
        });
        await logAudit({
            userId: user.id,
            userName: user.name ?? user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'EXPENSE',
            entityId: expense.id,
            details: JSON.stringify({ amount: data.amount, category: data.category }),
            branchId: user.branchId,
        });
        revalidatePath('/dashboard/expenses');
        return { success: true, expense };
    } catch (error) {
        console.error('Create Expense Error:', error);
        return { success: false, error: 'فشل في إضافة المصروف. يرجى المحاولة مرة أخرى.' };
    }
}

export async function updateExpense(
    id: string,
    data: { amount: number; category: string; description?: string; date?: Date },
) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, error: 'غير مصرح' };
    if (!tenantCtx.userPermissions.canCreateExpense) return { success: false, error: 'ليس لديك صلاحية لتعديل المصروفات.' };

    const { user, organizationId } = tenantCtx;

    if (!data.amount || data.amount <= 0 || !data.category) {
        return { success: false, error: 'يرجى تعبئة المبلغ والفئة بشكل صحيح.' };
    }

    try {
        // Verify the expense exists and belongs to this tenant's scope (no cross-tenant edits)
        const existing = await prisma.expense.findUnique({
            where: { id },
            select: { branchId: true, branch: { select: { organizationId: true } } },
        });
        if (!existing) return { success: false, error: 'المصروف غير موجود.' };

        const inScope = user.branchId
            ? existing.branchId === user.branchId
            : organizationId
            ? existing.branch?.organizationId === organizationId
            : false;
        if (!inScope) return { success: false, error: 'لا يمكنك تعديل هذا المصروف.' };

        const expense = await prisma.expense.update({
            where: { id },
            data: {
                amount: data.amount,
                category: data.category,
                description: data.description,
                ...(data.date ? { date: data.date } : {}),
            },
        });
        await logAudit({
            userId: user.id,
            userName: user.name ?? user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'EXPENSE',
            entityId: expense.id,
            details: JSON.stringify({ amount: data.amount, category: data.category }),
            branchId: existing.branchId ?? undefined,
        });
        revalidatePath('/dashboard/expenses');
        return { success: true, expense };
    } catch (error) {
        console.error('Update Expense Error:', error);
        return { success: false, error: 'فشل في تعديل المصروف. يرجى المحاولة مرة أخرى.' };
    }
}

export async function deleteExpense(id: string) {
    const tenantCtx = await getTenantContext();
    try {
        const expense = await prisma.expense.findUnique({ where: { id }, select: { category: true, amount: true, branchId: true } });
        await prisma.expense.delete({ where: { id } });
        if (!(tenantCtx instanceof NextResponse)) {
            await logAudit({
                userId: tenantCtx.user.id,
                userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
                action: 'DELETE',
                entity: 'EXPENSE',
                entityId: id,
                details: JSON.stringify({ category: expense?.category, amount: expense?.amount }),
                branchId: expense?.branchId ?? undefined,
            });
        }
        revalidatePath('/dashboard/expenses');
        return { success: true };
    } catch (error) {
        console.error('Delete Expense Error:', error);
        return { success: false, error: 'فشل في حذف المصروف. يرجى المحاولة مرة أخرى.' };
    }
}
