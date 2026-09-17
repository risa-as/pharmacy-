import { prisma } from '@/app/lib/prisma';

type NotificationType = 'LOW_STOCK' | 'EXPIRY' | 'NEW_PURCHASE' | 'SYSTEM';

interface SendNotificationParams {
    type: NotificationType;
    title: string;
    body: string;
    targetUserIds?: string[];
    branchId?: string;
    data?: Record<string, unknown>;
}

/**
 * Persists a Notification row for each target user, then fires Expo push
 * notifications to any devices with a registered token.
 *
 * Usage:
 *   await sendAndPersistNotification({
 *     type: 'LOW_STOCK',
 *     title: 'نقص مخزون',
 *     body: 'Paracetamol: الكمية أقل من الحد الأدنى',
 *     branchId: 'branch-uuid',
 *   });
 */
export async function sendAndPersistNotification({
    type,
    title,
    body,
    targetUserIds,
    branchId,
    data,
}: SendNotificationParams): Promise<void> {
    try {
        // Resolve target users
        let userIds: string[] = targetUserIds ?? [];

        if (userIds.length === 0 && branchId) {
            // Notify all users in the branch
            const branchUsers = await prisma.user.findMany({
                where: { branchId, isActive: true },
                select: { id: true },
            });
            userIds = branchUsers.map((u: any) => u.id);
        }

        if (userIds.length === 0) return;

        // Persist Notification rows
        await prisma.notification.createMany({
            data: userIds.map((userId: any) => ({
                userId,
                branchId: branchId ?? null,
                title,
                body,
                type,
                data: data ? (data as any) : undefined,
            })),
        });

        // Collect Expo push tokens
        const users = await prisma.user.findMany({
            where: {
                id: { in: userIds },
                isActive: true,
                pushEnabled: true,
                expoPushToken: { not: null },
            },
            select: { expoPushToken: true },
        });

        const tokens = users
            .map((u: any) => u.expoPushToken)
            .filter((t: string | null | undefined): t is string => !!t);

        if (tokens.length === 0) return;

        // Send to Expo Push API in batches of 100
        const messages = tokens.map((token: any) => ({
            to: token,
            title,
            body,
            sound: 'default',
            data: { type, ...(data ?? {}) },
        }));

        const chunks: typeof messages[] = [];
        for (let i = 0; i < messages.length; i += 100) {
            chunks.push(messages.slice(i, i + 100));
        }

        for (const chunk of chunks) {
            try {
                const response = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    signal: AbortSignal.timeout(5000),
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(chunk),
                });
                if (!response.ok) console.error('[NotificationTriggers] Expo push rejected:', response.status);
            } catch (err) {
                console.error('[NotificationTriggers] Expo push chunk failed:', err);
            }
        }
    } catch (error) {
        // Non-fatal: log but never throw — notification failure must not break business flows
        console.error('[NotificationTriggers] sendAndPersistNotification failed:', error);
    }
}

/**
 * يُعلِم كل حساب نشط تابع لمذخر محدد. تُستخدَم هذه الدالة لرحلة طلبات
 * المذاخر كي لا تعتمد المسارات التجارية على معرفة حساب المالك أو الموظفين
 * واحداً واحداً. فشل الإشعار لا يجب أن يتراجع معه الطلب أو الفاتورة.
 */
export async function notifyWarehouseUsers({
    warehouseId,
    title,
    body,
    data,
}: {
    warehouseId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
}): Promise<void> {
    try {
        const users = await prisma.user.findMany({
            where: {
                warehouseId,
                role: 'WAREHOUSE',
                isActive: true,
            },
            select: { id: true },
        });

        if (users.length === 0) return;

        await sendAndPersistNotification({
            type: 'SYSTEM',
            title,
            body,
            targetUserIds: users.map((user) => user.id),
            data: { kind: 'WAREHOUSE_ORDER', ...(data ?? {}) },
        });
    } catch (error) {
        // الإشعار غير حاسم تجارياً؛ لا نسمح لفشله بإفساد انتقال حالة صحيح.
        console.error('[NotificationTriggers] notifyWarehouseUsers failed:', error);
    }
}
