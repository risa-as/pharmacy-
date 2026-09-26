/**
 * One gate for everything that moves stock between this device and the cloud:
 * the stock snapshot (from reading pending ids until its local apply commits),
 * the sales and returns uploads (from reading unsynced rows until the acks are
 * written), and the online return (from the server call until the local restock
 * commits). Without it, a snapshot taken between a server write and its local
 * mirror counts that operation twice.
 *
 * A POS sale does not take the gate: its local transaction is serialized by
 * SQLite with the snapshot's apply transaction, which reads pending sales inside
 * itself. So selling never waits on the network.
 */
let held = false;
const waiting: Array<() => void> = [];

function release() {
    const next = waiting.shift();
    if (next) next();
    else held = false;
}

/** Runs fn if the gate is free; otherwise returns undefined without waiting. */
export async function tryWithStockGate<T>(fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
    if (held) return { ran: false };
    held = true;
    try { return { ran: true, value: await fn() }; }
    finally { release(); }
}

/** Waits up to timeoutMs for the gate, then runs fn; throws if the wait times out. */
export async function withStockGate<T>(fn: () => Promise<T>, timeoutMs = 15000): Promise<T> {
    if (held) {
        await new Promise<void>((resolve, reject) => {
            const entry = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(() => {
                const index = waiting.indexOf(entry);
                if (index >= 0) waiting.splice(index, 1);
                reject(new Error('مزامنة المخزون جارية؛ أعد المحاولة بعد لحظات.'));
            }, timeoutMs);
            waiting.push(entry);
        });
    } else {
        held = true;
    }
    try { return await fn(); }
    finally { release(); }
}
