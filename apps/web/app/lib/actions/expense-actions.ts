'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getExpenses(branchId: string) {
    return await prisma.expense.findMany({
        where: { branchId },
        orderBy: { date: 'desc' }
    });
}

export async function createExpense(branchId: string, data: { amount: number, category: string, description?: string, date?: Date }) {
    try {
        const expense = await prisma.expense.create({
            data: {
                branchId,
                amount: data.amount,
                category: data.category,
                description: data.description,
                date: data.date || new Date()
            }
        });
        revalidatePath('/dashboard/expenses');
        return { success: true, expense };
    } catch (error) {
        console.error('Create Expense Error:', error);
        return { success: false, error: 'فشل في إضافة المصروف. يرجى المحاولة مرة أخرى.' };
    }
}

export async function deleteExpense(id: string) {
    try {
        await prisma.expense.delete({ where: { id } });
        revalidatePath('/dashboard/expenses');
        return { success: true };
    } catch (error) {
        console.error('Delete Expense Error:', error);
        return { success: false, error: 'فشل في حذف المصروف. يرجى المحاولة مرة أخرى.' };
    }
}
