'use server'

import { prisma } from '@/app/lib/prisma'
import { revalidatePath } from 'next/cache'

export type ShiftStatus = {
    isWorking: boolean;
    currentShiftId?: string;
    startTime?: Date;
    duration?: number;
}

export async function getShiftStatus(userId: string): Promise<ShiftStatus> {
    const activeShift = await prisma.shift.findFirst({
        where: {
            userId,
            status: 'OPEN'
        }
    });

    if (activeShift) {
        return {
            isWorking: true,
            currentShiftId: activeShift.id,
            startTime: activeShift.startTime
        }
    }

    return { isWorking: false }
}

export async function clockIn(userId: string, branchId: string) {
    try {
        // Check if already open
        const existing = await prisma.shift.findFirst({
            where: { userId, status: 'OPEN' }
        });

        if (existing) {
            return { success: false, message: 'لديك وردية مفتوحة بالفعل' };
        }

        await prisma.shift.create({
            data: {
                userId,
                branchId,
                status: 'OPEN',
                startTime: new Date()
            }
        });

        revalidatePath('/');
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'فشل تسجيل الدخول' };
    }
}

export async function clockOut(userId: string) {
    try {
        const activeShift = await prisma.shift.findFirst({
            where: { userId, status: 'OPEN' }
        });

        if (!activeShift) {
            return { success: false, message: 'لا توجد وردية مفتوحة' };
        }

        const endTime = new Date();
        const durationMs = endTime.getTime() - activeShift.startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);

        await prisma.shift.update({
            where: { id: activeShift.id },
            data: {
                endTime,
                status: 'CLOSED',
                duration: durationHours
            }
        });

        revalidatePath('/');
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'فشل تسجيل الخروج' };
    }
}
