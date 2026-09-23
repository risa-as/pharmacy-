import store from './store';

export type ConflictEntity = 'SHIFT' | 'TRANSACTION' | 'LOYALTY';

/**
 * Records the server refused (another branch's data, invalid values) go to the
 * sync-failures review list and are marked synced in the same transaction, so
 * they neither retry forever nor block the next batch. Retrying from that list
 * clears `synced` again (main.ts, retry-sync-failure).
 */
export async function recordSyncConflicts(
    db: { $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> },
    entityType: ConflictEntity,
    locals: any[],
    conflicts: { id: string; message: string }[] | undefined,
    markSynced: (tx: any, id: string) => Promise<unknown>,
): Promise<number> {
    let recorded = 0;
    for (const conflict of conflicts ?? []) {
        const local = locals.find((item: any) => item.id === conflict.id);
        if (!local) continue;
        await db.$transaction(async (tx: any) => {
            const previous = await tx.syncFailure.findFirst({ where: { entityType, entityId: local.id } });
            if (!previous) await tx.syncFailure.create({ data: { entityType, entityId: local.id, payload: JSON.stringify(local), errorMessage: conflict.message } });
            await markSynced(tx, local.id);
        });
        recorded++;
    }
    if (recorded > 0) {
        store.set('syncFailureFlag', Date.now());
        console.warn(`[Sync] ${recorded} ${entityType} record(s) refused by the server; moved to sync failures for review.`);
    }
    return recorded;
}
