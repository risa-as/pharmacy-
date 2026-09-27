import { readStorage, writeStorage } from "../../../../packages/shared/src/safe-storage";

export type TransferAttempt = { hash: string; key: string };

/**
 * Idempotency key for one transfer: the saved one for the same body, else a new one.
 * It must be stored before sending: if the transfer is applied and its answer is lost,
 * only the stored key makes the next attempt (even after reopening the page) a replay
 * instead of a second transfer. Same rule as pending supplier payments.
 */
export function transferAttempt(body: unknown, storageKey: string, memory: TransferAttempt): TransferAttempt {
    const hash = JSON.stringify(body);
    let saved: any;
    try {
        saved = JSON.parse(readStorage("local", storageKey) || "null");
    }
    catch { }
    let attempt = memory;
    if (saved?.hash === hash && typeof saved.key === "string")
        attempt = saved;
    else if (memory.hash !== hash)
        attempt = { hash, key: crypto.randomUUID() };
    if (!writeStorage("local", storageKey, JSON.stringify(attempt)))
        throw Error("تعذر حفظ مفتاح منع التكرار على هذا الجهاز؛ لم يُرسل التحويل. حرّر مساحة التخزين أو أعد تشغيل التطبيق ثم أعد المحاولة.");
    return attempt;
}
