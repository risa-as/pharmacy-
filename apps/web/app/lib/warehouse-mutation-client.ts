'use client';

import { getSession } from 'next-auth/react';
import { toast } from 'sonner';
import { readStorage, removeStorage, writeStorage } from '../../../../packages/shared/src/safe-storage';

// One operation = one key, kept until its complete success answer arrives, so a
// lost answer followed by a retry (after a reload or a closed tab too) is replayed
// by the server instead of applied twice. The key is stored and read back before
// anything is sent: without a durable key the request is not sent at all.
//
// - localStorage (not sessionStorage) so the attempt outlives the tab, scoped to
//   the signed-in user because the server replays by warehouse + key only.
// - An unsettled attempt never expires: however late the retry, it carries the
//   same key and the server settles it (applies it once, or replays it and says
//   so with `x-idempotent-replay`).
// - A settled attempt must be verifiably retired before an identical new
//   operation gets a key; if the browser cannot retire it, the new operation is
//   refused rather than sent with the old key.
// - A key left by the previous version in sessionStorage has no owner, so it is
//   never imported: the operation stops for review.
const PREFIX = 'warehouse-pending:v2:';
const LEGACY_PREFIX = 'warehouse-pending:';

type StoredAttempt = { key: string; savedAt: number; state: 'pending' | 'settled' };

/** Nothing was sent: the message says why (callers show it instead of a network error). */
export class WarehouseMutationNotSentError extends Error {}

// Settled keys this page could not retire in storage (last line of defence).
const settledHere = new Set<string>();

async function sessionUserId(): Promise<string | null> {
    const session = await getSession();
    const id = (session?.user as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id ? id : null;
}

function storedAttempt(slot: string): StoredAttempt | null {
    try {
        const saved = JSON.parse(readStorage('local', slot) ?? 'null');
        if (typeof saved?.key !== 'string') return null;
        return { key: saved.key, savedAt: Number(saved.savedAt) || 0, state: saved.state === 'settled' ? 'settled' : 'pending' };
    } catch {
        return null;
    }
}

/** Removes the entry and confirms it is gone. */
const retire = (kind: 'local' | 'session', slot: string) => removeStorage(kind, slot) && readStorage(kind, slot) === null;

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

function settle(slot: string, attempt: StoredAttempt) {
    if (retire('local', slot)) return;
    if (writeStorage('local', slot, JSON.stringify({ ...attempt, state: 'settled' }))) return;
    settledHere.add(attempt.key);
}

async function isReplay(response: Response) {
    if (response.headers.get('x-idempotent-replay') === '1') return true;
    const body = await response.clone().json().catch(() => null);
    return body?.idempotentReplay === true;
}

export async function warehouseMutation(url: string, init: RequestInit, currentUser: () => Promise<string | null> = sessionUserId): Promise<Response> {
    const body = JSON.parse(String(init.body ?? '{}'));
    const fingerprint = JSON.stringify([url, init.method ?? 'POST', body]);
    const user = await currentUser().catch(() => null);
    if (!user) throw new WarehouseMutationNotSentError('تعذر التحقق من الحساب الحالي؛ لم تُرسل العملية. حدّث الصفحة وأعد المحاولة.');

    const legacySlot = LEGACY_PREFIX + fingerprint;
    if (readStorage('session', legacySlot) !== null) {
        const removed = retire('session', legacySlot);
        throw new WarehouseMutationNotSentError(
            'توجد محاولة سابقة غير مؤكدة لهذه العملية من إصدار أقدم، ولا يمكن التحقق من صاحبها؛ لم تُرسل العملية. '
            + (removed ? 'راجع سجل العمليات أولاً: إن لم تجدها مسجلة فأعد الإرسال.' : 'أغلق هذا التبويب، ثم راجع سجل العمليات قبل إعادة الإرسال.'));
    }

    // The storage key is a lookup key, not a security hash.
    const slot = `${PREFIX}${user}:${fingerprint}`;
    let attempt = storedAttempt(slot);
    if (attempt && (attempt.state === 'settled' || settledHere.has(attempt.key))) {
        // A finished operation with the same data: this is a new one and needs a new key.
        retire('local', slot);
        attempt = null;
    }
    if (!attempt) {
        // getRandomValues is also available on an HTTP LAN origin; subtle/randomUUID may be absent there.
        attempt = { key: newKey(), savedAt: Date.now(), state: 'pending' };
        if (!writeStorage('local', slot, JSON.stringify(attempt)))
            throw new WarehouseMutationNotSentError(storedAttempt(slot)
                ? 'تعذر إنهاء عملية سابقة مطابقة على هذا المتصفح؛ لم تُرسل العملية الجديدة كي لا تُحسب مكررة. أعد تحميل الصفحة أو حرّر مساحة التخزين ثم أعد المحاولة.'
                : 'تعذر حفظ مفتاح العملية على هذا المتصفح؛ لم تُرسل العملية. فعّل تخزين الموقع أو حرّر مساحة ثم أعد المحاولة.');
    }
    const response = await fetch(url, { ...init, body: JSON.stringify({ ...body, idempotencyKey: attempt.key }) });
    if (response.ok) {
        // Losing the body after headers arrived is still an ambiguous outcome.
        // Do not retire the key until the complete JSON result has arrived.
        await response.clone().json();
        settle(slot, attempt);
        if (await isReplay(response))
            toast.warning('سُجّلت هذه العملية في محاولة سابقة لم يصل ردها؛ لم تُسجّل عملية جديدة. إن كنت تقصد عملية جديدة مطابقة فأرسلها مرة أخرى.');
    }
    return response;
}
