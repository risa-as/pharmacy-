import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

function setup(deliver = true, reviews = 0, inventoryFailed = 0) {
    const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const start = source.indexOf('let staffSyncBusy = false;');
    const end = source.indexOf('// Sync debts (debt payments)', start);
    if (start < 0 || end < 0) throw Error('Staff sync handlers not found');
    const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    let pending = 1;
    const handlers: Record<string, Function> = {};
    const events: string[] = [];
    const saved = vi.fn();
    const zero = { count: async () => 0 };
    const deps = {
        ipcMain: { handle: (name: string, fn: Function) => { handlers[name] = fn; } },
        prisma: { sale: zero, saleReturn: zero, debtPayment: zero, syncFailure: { count: async () => reviews }, transaction: { count: async () => pending } },
        store: { get: (key: string) => ['loggedInUserId', 'syncUserId'].includes(key) ? 'employee' : undefined, set: saved },
        buildSyncHealthSnapshot: () => ({ pendingCount: 0, failedCount: inventoryFailed, inProgress: false }),
        getPendingSyncActions: () => [], isSyncRunning: () => false,
        syncSales: async () => { events.push('sales'); },
        syncSaleReturns: async () => { events.push('returns'); },
        syncDebtPayments: async () => { events.push('debts'); },
        syncTransactions: async () => { events.push('cash'); if (deliver) pending = 0; },
        processPendingSyncActions: async () => {}, syncProducts: async () => ({ success: true }),
        recordSyncSuccess: vi.fn(), BrowserWindow: { getAllWindows: () => [] },
    };
    new Function(...Object.keys(deps), code)(...Object.values(deps));
    return { handlers, saved, events };
}

it('counts pending cash and sends it after its documents during manual sync', async () => {
    const h = setup();
    expect(await h.handlers['staff:sync-health']()).toMatchObject({ pendingCount: 1, transactionsPending: 1 });
    expect(await h.handlers['trigger-sync']()).toEqual({ success: true });
    expect(h.events).toEqual(['sales', 'returns', 'debts', 'cash']);
    expect(await h.handlers['staff:sync-health']()).toMatchObject({ pendingCount: 0, transactionsPending: 0 });
});

it('does not report success or advance completion time while cash remains pending', async () => {
    const h = setup(false);
    expect(await h.handlers['trigger-sync']()).toMatchObject({ success: false });
    expect(h.saved).not.toHaveBeenCalled();
    expect(await h.handlers['staff:sync-health']()).toMatchObject({ pendingCount: 1, transactionsPending: 1, inProgress: false });
});


it('completes the current cycle while preserving the historical review count', async () => {
    const h = setup(true, 8698);
    expect(await h.handlers['trigger-sync']()).toEqual({ success: true });
    expect(await h.handlers['staff:sync-health']()).toMatchObject({ pendingCount: 0, reviewCount: 8698, failedCount: 8698 });
    expect(h.saved).toHaveBeenCalledWith('lastStaffSyncAt', expect.any(String));
});

it('does not hide a failed inventory action behind historical reviews', async () => {
    const h = setup(true, 8698, 1);
    expect(await h.handlers['trigger-sync']()).toMatchObject({ success: false });
    expect(h.saved).not.toHaveBeenCalled();
});

it('still reports unsent cash when historical reviews exist', async () => {
    const h = setup(false, 8698);
    expect(await h.handlers['trigger-sync']()).toMatchObject({ success: false });
    expect(h.saved).not.toHaveBeenCalled();
});
