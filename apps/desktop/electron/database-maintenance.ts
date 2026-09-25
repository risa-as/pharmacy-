import { AsyncLocalStorage } from 'node:async_hooks';

// Keep background sync and IPC requests away from a database being replaced.
const owner = new AsyncLocalStorage<boolean>();
let locked = false;
let active = 0;
const drained: Array<() => void> = [];
export async function withDatabaseQuery<T>(query: () => Promise<T>): Promise<T> {
    if (locked && !owner.getStore()) throw Error('تجري استعادة قاعدة البيانات؛ انتظر إعادة تشغيل التطبيق');
    active++;
    try { return await query(); }
    finally { if (--active === 0) drained.splice(0).forEach(resolve => resolve()); }
}

export async function withDatabaseRestore(restore: () => Promise<{ success: boolean; error?: string }>): Promise<{ success: boolean; error?: string }> {
    if (locked) return { success: false, error: 'تجري استعادة قاعدة البيانات بالفعل' };
    locked = true;
    try {
        if (active) await new Promise<void>((resolve, reject) => {
            const done = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(() => {
                const index = drained.indexOf(done);
                if (index >= 0) drained.splice(index, 1);
                reject(Error('تعذر بدء الاستعادة خلال 30 ثانية لأن قاعدة البيانات مشغولة. لم تُستبدل القاعدة؛ أعد المحاولة بعد اكتمال العمليات.'));
            }, 30_000);
            drained.push(done);
        });
        const result = await owner.run(true, restore);
        // Success must remain locked until the caller relaunches the app.
        if (!result.success) locked = false;
        return result;
    } catch (error) { locked = false; throw error; }
}
