'use client';

import { getSession } from 'next-auth/react';
import { toast } from 'sonner';
import { readStorage, removeStorage, storageKeys, writeStorage } from '../../../../packages/shared/src/safe-storage';

// One operation = one key, kept until its complete success answer arrives, so a
// lost answer followed by a retry (after a reload, in another tab, or much later)
// is replayed by the server instead of applied twice.
//
// - Every attempt is its own localStorage entry, named by its key
//   (`…:<user>:<request>#<key>`). An answer only ever retires the entry of the key
//   it carried, so a late answer in one tab can never remove another attempt.
// - The entry is written and read back before anything is sent; without it (or
//   when stored attempts cannot be listed) nothing is sent.
// - Scoped to the signed-in user: the server replays by warehouse + key only.
// - An unsettled attempt never expires: the oldest one for the same request is
//   sent again with its key and the server settles it (applies it once, or
//   replays it and says so with `x-idempotent-replay`).
// - A settled attempt is removed and checked gone, else marked settled, else
//   remembered by this page; it is never sent again as if it were pending.
// - A key left by the previous version in sessionStorage has no owner. It is kept
//   until the server says whether it was recorded; until then nothing is sent.
const PREFIX = 'warehouse-attempt:v3:';
const LEGACY_PREFIX = 'warehouse-pending:';
const STATUS_URL = '/api/warehouse-operations/status';

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

function readAttempt(name: string, key: string): StoredAttempt | null {
    try {
        const saved = JSON.parse(readStorage('local', name) ?? 'null');
        if (saved?.key !== key) return null;
        return { key, savedAt: Number(saved.savedAt) || 0, state: saved.state === 'settled' ? 'settled' : 'pending' };
    } catch {
        return null;
    }
}

/** Removes the entry and confirms it is gone. */
const retire = (kind: 'local' | 'session', name: string) => removeStorage(kind, name) && readStorage(kind, name) === null;

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

/** Retires exactly this attempt's own entry. */
function settle(name: string, attempt: StoredAttempt) {
    if (retire('local', name)) return;
    if (writeStorage('local', name, JSON.stringify({ ...attempt, state: 'settled' }))) return;
    settledHere.add(attempt.key);
}

async function isReplay(response: Response) {
    if (response.headers.get('x-idempotent-replay') === '1') return true;
    const body = await response.clone().json().catch(() => null);
    return body?.idempotentReplay === true;
}

/** true / false from the server, or null when it could not answer. */
async function recordedOnServer(url: string, key: string): Promise<boolean | null> {
    try {
        const response = await fetch(STATUS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, key }) });
        if (!response.ok) return null;
        const body = await response.json();
        return typeof body?.recorded === 'boolean' ? body.recorded : null;
    } catch {
        return null;
    }
}

/** Resolves an ownerless previous-version key on the server; throws while it cannot be resolved. */
async function resolveLegacyAttempt(url: string, fingerprint: string) {
    const legacySlot = LEGACY_PREFIX + fingerprint;
    const legacyKey = readStorage('session', legacySlot);
    if (legacyKey === null) return;
    const recorded = await recordedOnServer(url, legacyKey);
    if (recorded === null)
        throw new WarehouseMutationNotSentError('توجد محاولة سابقة غير مؤكدة لهذه العملية من إصدار أقدم، وتعذّر التحقق من الخادم هل سُجّلت؛ لم تُرسل العملية. أعد المحاولة عند توفر الاتصال.');
    const removed = retire('session', legacySlot);
    if (recorded)
        throw new WarehouseMutationNotSentError(removed
            ? 'المحاولة السابقة لهذه العملية مسجلة على الخادم؛ لم تُرسل عملية جديدة. إن كنت تقصد عملية جديدة مطابقة فأرسلها مرة أخرى.'
            : 'المحاولة السابقة لهذه العملية مسجلة على الخادم وتعذّر إنهاؤها على هذا المتصفح؛ لم تُرسل عملية جديدة. أغلق هذا التبويب ثم أعد المحاولة إن كنت تقصد عملية جديدة.');
    // Not recorded: the old attempt was never applied, so a new key is safe.
}

export async function warehouseMutation(url: string, init: RequestInit, currentUser: () => Promise<string | null> = sessionUserId): Promise<Response> {
    const body = JSON.parse(String(init.body ?? '{}'));
    const fingerprint = JSON.stringify([url, init.method ?? 'POST', body]);
    const user = await currentUser().catch(() => null);
    if (!user) throw new WarehouseMutationNotSentError('تعذر التحقق من الحساب الحالي؛ لم تُرسل العملية. حدّث الصفحة وأعد المحاولة.');

    await resolveLegacyAttempt(url, fingerprint);

    // The storage name is a lookup key, not a security hash.
    const base = `${PREFIX}${user}:${fingerprint}#`;
    const names = storageKeys('local');
    if (!names)
        throw new WarehouseMutationNotSentError('تعذر قراءة المحاولات المحفوظة على هذا المتصفح؛ لم تُرسل العملية. فعّل تخزين الموقع ثم أعد المحاولة.');
    let pending: { name: string; attempt: StoredAttempt } | null = null;
    let unretired = false;
    for (const name of names) {
        if (!name.startsWith(base)) continue;
        const attempt = readAttempt(name, name.slice(base.length));
        if (!attempt) continue;
        if (attempt.state === 'settled' || settledHere.has(attempt.key)) {
            // A finished attempt with the same data; tidy it up if the browser lets us.
            if (!retire('local', name)) unretired = true;
            continue;
        }
        if (!pending || attempt.savedAt < pending.attempt.savedAt) pending = { name, attempt };
    }
    if (!pending) {
        // getRandomValues is also available on an HTTP LAN origin; subtle/randomUUID may be absent there.
        const attempt: StoredAttempt = { key: newKey(), savedAt: Date.now(), state: 'pending' };
        pending = { name: base + attempt.key, attempt };
        if (!writeStorage('local', pending.name, JSON.stringify(attempt)))
            throw new WarehouseMutationNotSentError(unretired
                ? 'تعذر إنهاء عملية سابقة مطابقة على هذا المتصفح؛ لم تُرسل العملية الجديدة كي لا تُحسب مكررة. أعد تحميل الصفحة أو حرّر مساحة التخزين ثم أعد المحاولة.'
                : 'تعذر حفظ مفتاح العملية على هذا المتصفح؛ لم تُرسل العملية. فعّل تخزين الموقع أو حرّر مساحة ثم أعد المحاولة.');
    }
    const { name, attempt } = pending;
    const response = await fetch(url, { ...init, body: JSON.stringify({ ...body, idempotencyKey: attempt.key }) });
    if (response.ok) {
        // Losing the body after headers arrived is still an ambiguous outcome.
        // Do not retire the key until the complete JSON result has arrived.
        await response.clone().json();
        settle(name, attempt);
        if (await isReplay(response))
            toast.warning('سُجّلت هذه العملية في محاولة سابقة لم يصل ردها؛ لم تُسجّل عملية جديدة. إن كنت تقصد عملية جديدة مطابقة فأرسلها مرة أخرى.');
    }
    return response;
}
