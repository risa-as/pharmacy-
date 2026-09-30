import { prisma } from '@/app/lib/prisma';
import { baghdadDate, dateStart } from '@/app/lib/smart-purchasing';

export const DEFAULT_AI_DAILY_LIMIT = 50;
/** Hard limit on one provider call; the route aborts it and records FAILED. */
export const AI_PROVIDER_TIMEOUT_MS = 45_000;
/**
 * A reservation still RESERVED after this long was abandoned (the process died
 * between reserving and recording the outcome). It is far above the provider
 * timeout, so a request that is still running is never released early.
 */
export const AI_RESERVATION_STALE_MS = 5 * 60_000;

/** Start of the current Baghdad calendar day (the daily limit resets at Baghdad midnight). */
export const aiDayStart = (now = new Date()) => dateStart(baghdadDate(now));

/**
 * Requests counted against the daily limit: completed ones and reservations
 * still in flight. Failures and abandoned reservations are not counted.
 */
const counted = (organizationId: string, now: Date) => ({
    organizationId,
    createdAt: { gte: aiDayStart(now) },
    OR: [
        { status: 'OK' },
        { status: 'RESERVED', createdAt: { gte: new Date(now.getTime() - AI_RESERVATION_STALE_MS) } },
    ],
});

export async function aiUsageToday(organizationId: string, now = new Date()) {
    const [org, used] = await Promise.all([
        prisma.organization.findUnique({ where: { id: organizationId }, select: { aiDailyLimit: true } }),
        prisma.aiUsageLog.count({ where: counted(organizationId, now) }),
    ]);
    const limit = org?.aiDailyLimit ?? DEFAULT_AI_DAILY_LIMIT;
    return { limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * Atomically reserves one request slot before the provider is called. The count
 * and the insert run in one transaction holding a per-organization advisory
 * lock, so concurrent requests cannot all pass a check made before any of them
 * was recorded. Returns the reservation id, or null when the limit is reached.
 */
export async function reserveAiRequest(organizationId: string, now = new Date()): Promise<{ id: string; limit: number } | null> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ai-usage:' + organizationId}))`;
        const [org, used] = await Promise.all([
            tx.organization.findUnique({ where: { id: organizationId }, select: { aiDailyLimit: true } }),
            tx.aiUsageLog.count({ where: counted(organizationId, now) }),
        ]);
        const limit = org?.aiDailyLimit ?? DEFAULT_AI_DAILY_LIMIT;
        if (used >= limit) return null;
        const row = await tx.aiUsageLog.create({ data: { organizationId, status: 'RESERVED' }, select: { id: true } });
        return { id: row.id, limit };
    });
}

/**
 * Records the outcome and measurements. A provider failure is marked FAILED and
 * stops counting against the limit (the user is not charged for our outage).
 */
export async function completeAiRequest(id: string, outcome: {
    ok: boolean; startedAt: number; provider?: string; model?: string; categories?: string[];
    inputChars?: number; outputChars?: number; cardCount?: number; error?: string;
}) {
    await prisma.aiUsageLog.update({
        where: { id },
        data: {
            status: outcome.ok ? 'OK' : 'FAILED',
            completedAt: new Date(),
            latencyMs: Math.max(0, Date.now() - outcome.startedAt),
            provider: outcome.provider ?? null,
            model: outcome.model ?? null,
            categories: outcome.categories?.join(',') ?? null,
            inputChars: outcome.inputChars ?? null,
            outputChars: outcome.outputChars ?? null,
            cardCount: outcome.cardCount ?? null,
            error: outcome.error?.slice(0, 300) ?? null,
        },
    }).catch((e) => console.error('[AI usage] could not record outcome', e));
}
