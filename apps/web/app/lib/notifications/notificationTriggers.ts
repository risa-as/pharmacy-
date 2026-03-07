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
                where: { branchId },
                select: { id: true },
            });
            userIds = branchUsers.map(u => u.id);
        }

        if (userIds.length === 0) return;

        // Persist Notification rows
        await prisma.notification.createMany({
            data: userIds.map(userId => ({
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
                pushEnabled: true,
                expoPushToken: { not: null },
            },
            select: { expoPushToken: true },
        });

        const tokens = users
            .map(u => u.expoPushToken)
            .filter((t: string | null | undefined): t is string => !!t);

        if (tokens.length === 0) return;

        // Send to Expo Push API in batches of 100
        const messages = tokens.map(token => ({
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
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(chunk),
                });
            } catch (err) {
                console.error('[NotificationTriggers] Expo push chunk failed:', err);
            }
        }
    } catch (error) {
        // Non-fatal: log but never throw — notification failure must not break business flows
        console.error('[NotificationTriggers] sendAndPersistNotification failed:', error);
    }
}
