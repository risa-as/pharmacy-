'use server'

import { prisma } from '@/app/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/app/lib/audit'

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

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
        await prisma.shift.create({
            data: {
                userId,
                branchId,
                status: 'OPEN',
                startTime: new Date()
            }
        });
        await logAudit({
            userId,
            userName: user?.name ?? user?.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'SHIFT',
            details: JSON.stringify({ event: 'clock_in' }),
            branchId,
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

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
        await prisma.shift.update({
            where: { id: activeShift.id },
            data: {
                endTime,
                status: 'CLOSED',
                duration: durationHours
            }
        });
        await logAudit({
            userId,
            userName: user?.name ?? user?.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'SHIFT',
            entityId: activeShift.id,
            details: JSON.stringify({ event: 'clock_out', durationHours: Math.round(durationHours * 100) / 100 }),
            branchId: activeShift.branchId,
        });

        revalidatePath('/');
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'فشل تسجيل الخروج' };
    }
}
