'use client';

import { getSession } from 'next-auth/react';
import { readStorage, removeStorage, writeStorage } from '../../../../packages/shared/src/safe-storage';

// One operation = one key, kept until its complete success response arrives, so a
// lost answer followed by a retry (after a reload or a closed tab too) is replayed
// by the server instead of applied twice. The key is stored and read back before
// anything is sent: without a durable key the request is not sent at all.
//
// localStorage (not sessionStorage) so the attempt outlives the tab; scoped to the
// signed-in user because the server replays by warehouse + key only; and dropped
// after a day so an old unsettled attempt is never replayed onto a new operation.
const PREFIX = 'warehouse-pending:v2:';
const LEGACY_PREFIX = 'warehouse-pending:';
export const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredAttempt = { key: string; savedAt: number };

/** Nothing was sent: the message says why (callers show it instead of a network error). */
export class WarehouseMutationNotSentError extends Error {}

async function sessionUserId(): Promise<string | null> {
    const session = await getSession();
    const id = (session?.user as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id ? id : null;
}

function storedAttempt(slot: string): StoredAttempt | null {
    try {
        const saved = JSON.parse(readStorage('local', slot) ?? 'null');
        if (typeof saved?.key !== 'string' || typeof saved.savedAt !== 'number') return null;
        return Date.now() - saved.savedAt < ATTEMPT_TTL_MS ? saved : null;
    } catch {
        return null;
    }
}

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

export async function warehouseMutation(url: string, init: RequestInit, currentUser: () => Promise<string | null> = sessionUserId): Promise<Response> {
    const body = JSON.parse(String(init.body ?? '{}'));
    const fingerprint = JSON.stringify([url, init.method ?? 'POST', body]);
    const user = await currentUser().catch(() => null);
    if (!user) throw new WarehouseMutationNotSentError('تعذر التحقق من الحساب الحالي؛ لم تُرسل العملية. حدّث الصفحة وأعد المحاولة.');
    // The storage key is a lookup key, not a security hash.
    const slot = `${PREFIX}${user}:${fingerprint}`;
    const legacySlot = LEGACY_PREFIX + fingerprint;
    let attempt = storedAttempt(slot);
    if (!attempt) {
        // getRandomValues is also available on an HTTP LAN origin; subtle/randomUUID may be absent there.
        attempt = { key: readStorage('session', legacySlot) ?? newKey(), savedAt: Date.now() };
        if (!writeStorage('local', slot, JSON.stringify(attempt)))
            throw new WarehouseMutationNotSentError('تعذر حفظ مفتاح العملية على هذا المتصفح؛ لم تُرسل العملية. فعّل تخزين الموقع أو حرّر مساحة ثم أعد المحاولة.');
    }
    const response = await fetch(url, { ...init, body: JSON.stringify({ ...body, idempotencyKey: attempt.key }) });
    if (response.ok) {
        // Losing the body after headers arrived is still an ambiguous outcome.
        // Do not retire the key until the complete JSON result has arrived.
        await response.clone().json();
        removeStorage('local', slot);
        removeStorage('session', legacySlot);
    }
    return response;
}
