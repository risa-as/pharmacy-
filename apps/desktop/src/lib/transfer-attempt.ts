import { readStorage, writeStorage } from "../../../../packages/shared/src/safe-storage";

export type TransferAttempt = { hash: string; key: string };

/** Idempotency key for one transfer: the saved one for the same body, else a new one. */
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
    // Without storage the key stays in memory for this session (same send, same key).
    writeStorage("local", storageKey, JSON.stringify(attempt));
    return attempt;
}
