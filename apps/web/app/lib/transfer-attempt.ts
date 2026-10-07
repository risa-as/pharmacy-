import { tryReadStorage, writeStorage, removeStorage } from '../../../../packages/shared/src/safe-storage';

type Attempt = { key: string; signature: string; state: 'pending' | 'settled' };
const message = 'تعذر قراءة أو حفظ محاولة التحويل؛ لم يُرسل الطلب. لا تمسح بيانات الموقع قبل التحقق من نتيجة المحاولة السابقة.';
function read(name: string): Attempt | null {
  const raw = tryReadStorage('local', name);
  if (raw === undefined) throw new Error(message);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value.key) || typeof value.signature !== 'string' || !['pending', 'settled'].includes(value.state)) throw new Error();
    return value;
  } catch { throw new Error(message); }
}
// Call under the same browser Web Lock for prepare and finish. Scope is the
// current user AND source branch, matching server actor/branch authorization.
export function prepareTransferAttempt(name: string, body: unknown): Attempt {
  const signature = JSON.stringify(body), saved = read(name);
  if (saved?.state === 'pending' && saved.signature !== signature)
    throw new Error('توجد محاولة تحويل غير محسومة. أعد إرسال بياناتها نفسها للتحقق من نتيجتها قبل بدء تحويل آخر.');
  const attempt: Attempt = saved?.state === 'pending' ? saved : { key: crypto.randomUUID(), signature, state: 'pending' };
  if (!writeStorage('local', name, JSON.stringify(attempt))) throw new Error(message);
  return attempt;
}
export function pendingTransferBody(name: string): any | null {
  const saved = read(name);
  if (!saved || saved.state === 'settled') return null;
  try {
    const body = JSON.parse(saved.signature);
    if (!body || typeof body.fromBranchId !== 'string' || typeof body.toBranchId !== 'string' || !Array.isArray(body.items) || !body.items.length) throw new Error();
    return body;
  } catch { throw new Error(message); }
}
export function finishTransferAttempt(name: string, key: string): void {
  const saved = read(name);
  // A late success must never delete a newer attempt in another tab.
  if (!saved || saved.key !== key) return;
  if (removeStorage('local', name) && tryReadStorage('local', name) === null) return;
  if (!writeStorage('local', name, JSON.stringify({ ...saved, state: 'settled' }))) throw new Error(message);
}
