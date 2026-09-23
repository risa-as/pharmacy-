import store from './store';

/**
 * Server-issued operator proofs (N16), one per employee who signed in online on
 * this device. Each synced sale or debt payment carries the proof of the
 * employee it names, so the cloud can tell a proven operator from a claimed one.
 * A proof is not a sync credential: it cannot authenticate anything by itself.
 */
const KEY = 'operatorProofs';

function all(): Record<string, string> {
    const value = store.get(KEY);
    return value && typeof value === 'object' ? { ...(value as Record<string, string>) } : {};
}

export function saveOperatorProof(userId: string, proof: unknown): void {
    if (!userId || typeof proof !== 'string' || !proof) return;
    store.set(KEY, { ...all(), [userId]: proof });
}

/** Proofs for the operators named in a batch (only those this device holds). */
export function operatorProofsFor(userIds: Array<string | null | undefined>): Record<string, string> {
    const held = all();
    const out: Record<string, string> = {};
    for (const id of userIds) if (id && held[id]) out[id] = held[id];
    return out;
}
