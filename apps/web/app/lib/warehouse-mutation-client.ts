'use client';

import { getSession } from 'next-auth/react';
import { toast } from 'sonner';
import { readStorage, removeStorage, storageKeys, tryReadStorage, writeStorage } from '../../../../packages/shared/src/safe-storage';

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
// - A stored attempt that cannot be read, or whose content is corrupt, blocks the
//   send: it may be a payment whose answer was lost. Only an entry that is really
//   gone (a successful read finds nothing) is skipped.
// - A key left by the previous version in sessionStorage has no owner. It is kept
//   until the server resolves it: «recorded», or voided so that its old request
//   can never apply later. Only then may a new key be used; until then nothing is sent.
const PREFIX = 'warehouse-attempt:v3:';
const LEGACY_PREFIX = 'warehouse-pending:';
const RESOLVE_URL = '/api/warehouse-operations/resolve';

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

/** The stored attempt; 'gone' only when a successful read finds nothing; 'unreadable' / 'corrupt' otherwise. */
function readAttempt(name: string, key: string): StoredAttempt | 'gone' | 'unreadable' | 'corrupt' {
    const raw = tryReadStorage('local', name);
    if (raw === undefined) return 'unreadable';
    if (raw === null) return 'gone';
    try {
        const saved = JSON.parse(raw);
        if (!key || saved?.key !== key || (saved.state !== 'pending' && saved.state !== 'settled')) return 'corrupt';
        return { key, savedAt: Number(saved.savedAt) || 0, state: saved.state };
    } catch {
        return 'corrupt';
    }
}

/** Removes the entry and confirms it is gone (a failed read does not count as gone). */
const retire = (kind: 'local' | 'session', name: string) => removeStorage(kind, name) && tryReadStorage(kind, name) === null;

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

/**
 * 'recorded', or 'voided' (never applied, and the server will refuse it from now
 * on), or null when the server could not settle it. A bare «not recorded» without
 * the void is not an answer: the old request could still arrive.
 */
async function resolveOnServer(url: string, key: string): Promise<'recorded' | 'voided' | null> {
    try {
        const response = await fetch(RESOLVE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, key }) });
        if (!response.ok) return null;
        const body = await response.json();
        if (body?.recorded === true) return 'recorded';
        if (body?.recorded === false && body?.voided === true) return 'voided';
        return null;
    } catch {
        return null;
    }
}

/** Resolves an ownerless previous-version key on the server; throws while it cannot be resolved. */
async function resolveLegacyAttempt(url: string, fingerprint: string) {
    const legacySlot = LEGACY_PREFIX + fingerprint;
    const legacyKey = readStorage('session', legacySlot);
    if (legacyKey === null) return;
    const answer = await resolveOnServer(url, legacyKey);
    if (answer === null)
        throw new WarehouseMutationNotSentError('توجد محاولة سابقة غير مؤكدة لهذه العملية من إصدار أقدم، وتعذّر التحقق من الخادم هل سُجّلت؛ لم تُرسل العملية. أعد المحاولة عند توفر الاتصال.');
    const removed = retire('session', legacySlot);
    if (answer === 'recorded')
        throw new WarehouseMutationNotSentError(removed
            ? 'المحاولة السابقة لهذه العملية مسجلة على الخادم؛ لم تُرسل عملية جديدة. إن كنت تقصد عملية جديدة مطابقة فأرسلها مرة أخرى.'
            : 'المحاولة السابقة لهذه العملية مسجلة على الخادم وتعذّر إنهاؤها على هذا المتصفح؛ لم تُرسل عملية جديدة. أغلق هذا التبويب ثم أعد المحاولة إن كنت تقصد عملية جديدة.');
    // Voided: the old attempt was never applied and can no longer be, so a new key is safe.
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
    let unknown = false;
    for (const name of names) {
        if (!name.startsWith(base)) continue;
        const attempt = readAttempt(name, name.slice(base.length));
        if (attempt === 'gone') continue;
        if (attempt === 'unreadable' || attempt === 'corrupt') { unknown = true; continue; }
        if (attempt.state === 'settled' || settledHere.has(attempt.key)) {
            // A finished attempt with the same data; tidy it up if the browser lets us.
            if (!retire('local', name)) unretired = true;
            continue;
        }
        if (!pending || attempt.savedAt < pending.attempt.savedAt) pending = { name, attempt };
    }
    if (unknown)
        throw new WarehouseMutationNotSentError('تعذّرت قراءة محاولة محفوظة لهذه العملية على هذا المتصفح، وقد تكون عملية لم يصل ردها؛ لم تُرسل العملية كي لا تُسجّل مرتين. أعد تحميل الصفحة ثم أعد المحاولة، وإن استمر ذلك فراجع سجل العمليات.');
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
