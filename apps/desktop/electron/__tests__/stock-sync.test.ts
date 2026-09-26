import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../db', () => ({ prisma: {} }));
vi.mock('../store', () => ({ default: { get: () => [] } }));
import * as validation from '../product-snapshot-validation';
import * as maps from '../product-sync-maps';
import * as diff from '../product-sync-diff';
import { planDrugStock, pendingStock, SYNTHETIC_BATCH_NUMBER } from '../stock-reconcile';
import { pendingStockInTx } from '../stock-pull';

// Runs the real pull (syncProductsExclusive) with the real pending-stock read and
// plan, against an in-memory store. No network, Electron or customer data.
type Local = {
    inventories?: any[]; batches?: any[];
    sales?: any[]; saleItems?: any[]; returns?: any[]; returnItems?: any[]; failures?: any[];
};
type Cloud = { stock: number; batches?: any[] };
type Opts = {
    before?: { saleIds?: string[]; returnIds?: string[]; protectedInventoryIds?: string[] };
    applied?: { saleIds: string[]; returnIds: string[] } | null;
    /** Text the sync must report; without it the sync must succeed. */
    warning?: string;
};

const source = readFileSync(new URL('../sync.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function syncProductsExclusive()');
const helpers = source.slice(source.indexOf('const SQLITE_VAR_LIMIT'), source.indexOf('// Debug log file'));
const code = ts.transpileModule(helpers + '\n' + source.slice(start, source.indexOf('\n}', start) + 2),
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function store(local: Local) {
    const batches = local.batches ?? [];
    return {
        globalDrug: [{ id: 'd', barcode: 'bc', tradeName: 'D', scientificName: 'D', price: 1, isActive: true }],
        // Consistent starting point: the inventory equals its batches.
        inventory: local.inventories ?? [{ id: 'inv', drugId: 'd', branchId: 'branch', quantity: batches.reduce((s, b) => s + b.quantity, 0), costPrice: 1, minStock: 0, maxStock: 100, syncPending: false }],
        batch: batches,
        sale: local.sales ?? [], saleItem: local.saleItems ?? [],
        saleReturn: local.returns ?? [], saleReturnItem: local.returnItems ?? [],
        syncFailure: local.failures ?? [],
    } as Record<string, any[]>;
}

async function runPull(rows: Record<string, any[]>, cloud: Cloud, opts: Opts) {
    const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: any) =>
        value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
    const model = (name: string) => ({
        findMany: vi.fn(async ({ where }: any = {}) => rows[name].filter(r => matches(r, where)).map(r => ({ ...r }))),
        findUnique: vi.fn(async ({ where }: any) => rows[name].find(r => r.id === where.id) ?? null),
        create: vi.fn(async ({ data }: any) => { const row = { id: data.id ?? `new-${rows[name].length}`, ...data }; rows[name].push(row); return { ...row }; }),
        update: vi.fn(async ({ where, data }: any) => { const row = rows[name].find(r => r.id === where.id); Object.assign(row, data); return { ...row }; }),
        updateMany: vi.fn(async () => ({ count: 0 })),
        deleteMany: vi.fn(async ({ where }: any) => { for (let i = rows[name].length - 1; i >= 0; i--) if (matches(rows[name][i], where)) rows[name].splice(i, 1); }),
    });
    const tx: any = Object.fromEntries(Object.keys(rows).map(name => [name, model(name)]));
    const drugs = [{ id: 'd', inventoryId: 'inv', barcode: 'bc', tradeName: 'D', scientificName: 'D', stock: cloud.stock, batches: cloud.batches }];
    const before = { saleIds: opts.before?.saleIds ?? [], returnIds: opts.before?.returnIds ?? [], protectedInventoryIds: new Set(opts.before?.protectedInventoryIds ?? []) };
    const errors: unknown[] = [];
    const deps: any = {
        ...validation, ...maps, ...diff, beginSyncTask: () => true, endSyncTask: () => {}, checkConnection: async () => true,
        getBranchId: () => 'branch', readPendingStockIds: async () => before,
        fetchStockSnapshot: async () => ({ snapshot: { drugs }, applied: opts.applied === undefined ? { saleIds: [], returnIds: [] } : opts.applied, fromCache: false }),
        pendingStockInTx, planDrugStock, SYNTHETIC_BATCH_NUMBER, queuedInventoryIds: () => new Set<string>(),
        prisma: { $transaction: async (fn: any) => fn(tx) }, recordSyncSuccess: vi.fn(),
        console: { log: vi.fn(), warn: vi.fn(), error: (...args: unknown[]) => errors.push(args) },
    };
    const result = await new Function(...Object.keys(deps), code + ';return syncProductsExclusive();')(...Object.values(deps));
    // A per-drug error is caught inside the pull and looks like a hold: never allow one.
    expect(errors).toEqual([]);
    if (opts.warning) expect(result.reason).toContain(opts.warning);
    else expect(result).toMatchObject({ success: true });
    // The inventory total always equals the sum of its batches.
    for (const inv of rows.inventory) {
        expect(inv.quantity).toBe(rows.batch.filter(b => b.inventoryId === inv.id).reduce((s, b) => s + b.quantity, 0));
    }
    return result;
}

const state = (rows: Record<string, any[]>) => ({
    inventory: rows.inventory.map(i => [i.id, i.quantity]),
    batches: rows.batch.map(b => [b.id, b.inventoryId, b.quantity]).sort(),
});

/** Two pulls with the same cloud and pending state must leave the same stock. */
async function pull(cloud: Cloud, local: Local, opts: Opts = {}) {
    const rows = store(local);
    const result = await runPull(rows, cloud, opts);
    const first = state(rows);
    await runPull(rows, cloud, opts);
    expect(state(rows)).toEqual(first);
    return {
        result, rows,
        qty: (id: string) => rows.batch.find(b => b.id === id)?.quantity,
        inventory: () => rows.inventory.find(i => i.id === 'inv')?.quantity,
        batchIds: () => rows.batch.map(b => b.id).sort(),
        /** A later pull, after the device or the cloud changed. */
        again: (nextCloud: Cloud, nextOpts: Opts = {}) => runPull(rows, nextCloud, nextOpts),
    };
}

const b1 = (quantity: number) => ({ id: 'b1', inventoryId: 'inv', batchNumber: 'L1', quantity, expiryDate: new Date('2030-01-01'), costPrice: 1 });
const cloudB1 = (quantity: number) => ({ id: 'b1', batchNumber: 'L1', quantity, expiryDate: '2030-01-01', costPrice: 1 });
const cloudBatch = (id: string, quantity: number, expiryDate = '2031-01-01') => ({ id, batchNumber: id, quantity, expiryDate, costPrice: 1 });
const syn = (quantity: number) => ({ id: 'syn', inventoryId: 'inv', batchNumber: 'SYNCED', quantity, expiryDate: new Date('2099-12-31'), costPrice: 1 });
const sale = (id: string, synced: boolean, allocations: string | null = JSON.stringify([{ batchId: 'b1', quantity: 3 }])) => ({
    sales: [{ id, synced }], saleItems: [{ id: 'i-' + id, saleId: id, drugId: 'd', quantity: 3, batchAllocations: allocations }],
});
const onBatch = (batchId: string, quantity = 3) => JSON.stringify([{ batchId, quantity }]);
const pendingReturn = (batchId: string, quantity = 2) => ({
    returns: [{ id: 'ret', synced: false }],
    returnItems: [{ id: 'ri', saleReturnId: 'ret', drugId: 'd', quantity, stockStatus: 'RESTOCKED', batchAllocations: onBatch(batchId, quantity) }],
});
const UNMATCHED = 'لم يُضف إلى المخزون المتاح ويحتاج تسوية موثقة';
const HELD = 'لم تكتمل مطابقة مخزون الصنف D';

describe('stock pull: the cloud quantity plus what the device did that the cloud does not include yet', () => {
    it('brings a cloud increase to the device when nothing is pending', async () => {
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(0)] });
        expect(x.qty('b1')).toBe(20);
        expect(x.inventory()).toBe(20);
    });

    it('keeps a pending local sale deducted from the cloud quantity', async () => {
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(5)], ...sale('s1', false) }, { before: { saleIds: ['s1'] } });
        expect(x.qty('b1')).toBe(17);
        expect(x.inventory()).toBe(17);
    });

    it('does not deduct twice a sale the server saved while its response was lost', async () => {
        const x = await pull({ stock: 17, batches: [cloudB1(17)] }, { batches: [b1(5)], ...sale('s1', false) },
            { before: { saleIds: ['s1'] }, applied: { saleIds: ['s1'], returnIds: [] } });
        expect(x.qty('b1')).toBe(17);
    });

    it('counts a sale saved on the device after the snapshot was requested', async () => {
        // Not in the ids sent to the server, pending in the apply transaction.
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(20)], ...sale('late', false) });
        expect(x.qty('b1')).toBe(17);
    });

    it('keeps a rejected sale deducted while it is under review, and releases it once resolved', async () => {
        const rejected = { ...sale('r1', true), failures: [{ id: 'f1', entityType: 'SALE', entityId: 'r1' }] };
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(17)], ...rejected }, { before: { saleIds: ['r1'] } });
        expect(x.qty('b1')).toBe(17);
        x.rows.syncFailure.length = 0;
        await x.again({ stock: 20, batches: [cloudB1(20)] });
        expect(x.qty('b1')).toBe(20);
    });

    it('with applied unknown (older server), still protects a sale saved during the pull', async () => {
        // The local batch already reflects the deduction; the cloud does not.
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(17)], ...sale('late', false) }, { applied: null });
        expect(x.qty('b1')).toBe(17);
    });

    it('keeps the previous safe rule for a pending line with no batch detail (legacy)', async () => {
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(5)], ...sale('old', false, null) }, { before: { saleIds: ['old'] } });
        expect(x.qty('b1')).toBe(5);
    });

    it('with an older server: safe rule only where a pending sale touched, increases elsewhere', async () => {
        const b2 = { id: 'b2', inventoryId: 'inv', batchNumber: 'L2', quantity: 0, expiryDate: new Date('2031-01-01'), costPrice: 1 };
        const x = await pull({ stock: 25, batches: [cloudB1(20), cloudBatch('b2', 5)] },
            { batches: [b1(17), b2], ...sale('s1', false) }, { before: { saleIds: ['s1'] }, applied: null });
        expect(x.qty('b1')).toBe(17);
        expect(x.qty('b2')).toBe(5);
        expect(x.inventory()).toBe(22);
    });

    it('adds back a restock from a return the cloud has not applied yet', async () => {
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(22)], ...pendingReturn('b1') }, { before: { returnIds: ['ret'] } });
        expect(x.qty('b1')).toBe(22);
    });

    it('leaves a local add still queued for upload untouched', async () => {
        const x = await pull({ stock: 0, batches: [cloudB1(0)] }, { batches: [b1(9)] }, { before: { protectedInventoryIds: ['inv'] } });
        expect(x.qty('b1')).toBe(9);
        expect(x.inventory()).toBe(9);
    });

    it('never goes below zero', async () => {
        const big = sale('s1', false, onBatch('b1', 50));
        expect((await pull({ stock: 20, batches: [cloudB1(20)] }, { batches: [b1(0)], ...big }, { before: { saleIds: ['s1'] } })).qty('b1')).toBe(0);
    });
});

describe('stock pull: pending operations on a batch the cloud replaced or removed', () => {
    it('holds a pending sale on a replaced batch back from the remaining batches until the server applies it', async () => {
        // The current server shape: the cloud total is the sum of its batches.
        const x = await pull({ stock: 10, batches: [cloudB1(10)] }, { batches: [syn(7)], ...sale('s1', false, onBatch('syn')) }, { before: { saleIds: ['s1'] } });
        expect(x.batchIds()).toEqual(['b1']);
        expect(x.qty('b1')).toBe(7);
        expect(x.inventory()).toBe(7);
        // The sale keeps its recorded batch: the reservation is not written into it.
        expect(x.rows.saleItem[0].batchAllocations).toBe(onBatch('syn'));

        // The server applies it and the acknowledgement arrives: no second deduction.
        x.rows.sale[0].synced = true;
        await x.again({ stock: 7, batches: [cloudB1(7)] });
        expect(x.qty('b1')).toBe(7);
    });

    it('does not deduct twice when the server applied the replaced-batch sale but the acknowledgement was lost', async () => {
        const x = await pull({ stock: 10, batches: [cloudBatch('b2', 10)] }, { batches: [b1(7)], ...sale('s1', false) }, { before: { saleIds: ['s1'] } });
        expect(x.qty('b2')).toBe(7);
        await x.again({ stock: 7, batches: [cloudBatch('b2', 7)] }, { before: { saleIds: ['s1'] }, applied: { saleIds: ['s1'], returnIds: [] } });
        expect(x.qty('b2')).toBe(7);
        expect(x.inventory()).toBe(7);
    });

    it('keeps the reservation while the server holds the sale for review', async () => {
        const x = await pull({ stock: 10, batches: [cloudB1(10)] }, { batches: [syn(7)], ...sale('s1', false, onBatch('syn')) }, { before: { saleIds: ['s1'] } });
        x.rows.sale[0].synced = true;
        x.rows.syncFailure.push({ id: 'f1', entityType: 'SALE', entityId: 's1' });
        await x.again({ stock: 10, batches: [cloudB1(10)] }, { before: { saleIds: ['s1'] } });
        expect(x.qty('b1')).toBe(7);
    });

    it('takes the reservation from sellable batches first, earliest expiry first', async () => {
        const x = await pull({ stock: 15, batches: [cloudBatch('expired', 5, '2020-01-01'), cloudBatch('late', 5, '2032-01-01'), cloudBatch('soon', 5, '2031-01-01')] },
            { batches: [b1(7)], ...sale('s1', false, onBatch('b1', 7)) }, { before: { saleIds: ['s1'] } });
        expect([x.qty('expired'), x.qty('soon'), x.qty('late')]).toEqual([5, 0, 3]);
        expect(x.inventory()).toBe(8);
    });

    it('does not move a pending return to another batch or make it sellable, and says it needs settlement', async () => {
        const x = await pull({ stock: 5, batches: [cloudB1(5)] },
            { batches: [{ ...b1(0), id: 'gone' }, b1(5)], ...pendingReturn('gone') }, { before: { returnIds: ['ret'] }, warning: UNMATCHED });
        expect(x.batchIds()).toEqual(['b1']);
        expect(x.qty('b1')).toBe(5);
        // Applied by the server (which quarantines it): nothing pending, no message.
        x.rows.saleReturn[0].synced = true;
        await x.again({ stock: 5, batches: [cloudB1(5)] });
        expect(x.qty('b1')).toBe(5);
    });

    it('does not add a pending return to an expired cloud batch, as the server quarantines it', async () => {
        const expired = { ...b1(7), id: 'old', expiryDate: new Date('2020-01-01') };
        const cloud = { stock: 5, batches: [cloudBatch('old', 5, '2020-01-01')] };
        const x = await pull(cloud, { batches: [expired], ...pendingReturn('old') }, { before: { returnIds: ['ret'] }, warning: UNMATCHED });
        expect(x.qty('old')).toBe(5);
        expect(x.inventory()).toBe(5);
        // Same with a server that cannot say what it applied: no hold, still not added.
        await x.again(cloud, { before: { returnIds: ['ret'] }, applied: null, warning: UNMATCHED });
        expect(x.qty('old')).toBe(5);
        // Applied (quarantined) by the server: nothing pending, no message, no change.
        x.rows.saleReturn[0].synced = true;
        await x.again(cloud);
        expect(x.qty('old')).toBe(5);
    });

    it('does not create a synthetic batch for a return into a batch the cloud has at zero', async () => {
        const x = await pull({ stock: 0, batches: [cloudB1(0)] }, { batches: [b1(2)], ...pendingReturn('b1') }, { before: { returnIds: ['ret'] } });
        expect(x.batchIds()).toEqual(['b1']);
        expect(x.qty('b1')).toBe(2);
        expect(x.inventory()).toBe(2);
    });
});

describe('stock pull: the synthetic batch (cloud stock without batch detail)', () => {
    it('keeps its id across pulls, so a pending sale on it stays deducted', async () => {
        const x = await pull({ stock: 10, batches: [] }, { batches: [syn(7)], ...sale('s1', false, onBatch('syn')) }, { before: { saleIds: ['s1'] } });
        expect(x.batchIds()).toEqual(['syn']);
        expect(x.inventory()).toBe(7);
        await x.again({ stock: 7, batches: [] }, { before: { saleIds: ['s1'] }, applied: { saleIds: ['s1'], returnIds: [] } });
        expect(x.qty('syn')).toBe(7);
    });

    it('with an older server keeps the pending sale on it deducted', async () => {
        const x = await pull({ stock: 10, batches: [] }, { batches: [syn(7)], ...sale('s1', false, onBatch('syn')) }, { before: { saleIds: ['s1'] }, applied: null });
        expect(x.batchIds()).toEqual(['syn']);
        expect(x.inventory()).toBe(7);
    });

    it('is created only for cloud stock that has no batch detail', async () => {
        const created = await pull({ stock: 4, batches: [] }, {});
        expect(created.rows.batch.map(b => [b.batchNumber, b.quantity])).toEqual([['SYNCED', 4]]);
        const none = await pull({ stock: 0, batches: [cloudB1(0)] }, { batches: [b1(0)] });
        expect(none.batchIds()).toEqual(['b1']);
    });
});

describe('stock pull: when the reservation cannot be computed from cloud values', () => {
    it('with an older server, keeps the local stock of a drug whose pending sale is on a replaced batch, and says so', async () => {
        const x = await pull({ stock: 10, batches: [cloudB1(10)] }, { batches: [syn(7)], ...sale('s1', false, onBatch('syn')) },
            { before: { saleIds: ['s1'] }, applied: null, warning: HELD });
        expect(x.batchIds()).toEqual(['syn']);
        expect(x.inventory()).toBe(7);
        // Once the server reports what it applied, the drug is reconciled.
        await x.again({ stock: 10, batches: [cloudB1(10)] }, { before: { saleIds: ['s1'] } });
        expect(x.batchIds()).toEqual(['b1']);
        expect(x.qty('b1')).toBe(7);
    });

    it('holds a drug with a legacy line (no batch detail) and a pending sale on a replaced batch', async () => {
        const x = await pull({ stock: 20, batches: [cloudB1(20)] }, {
            batches: [b1(10), { ...syn(4) }],
            sales: [{ id: 'old', synced: false }, { id: 's1', synced: false }],
            saleItems: [
                { id: 'i-old', saleId: 'old', drugId: 'd', quantity: 3, batchAllocations: null },
                { id: 'i-s1', saleId: 's1', drugId: 'd', quantity: 3, batchAllocations: onBatch('syn') },
            ],
        }, { before: { saleIds: ['old', 's1'] }, warning: HELD });
        expect(x.inventory()).toBe(14);
    });
});

describe('pendingStock', () => {
    it('keeps deductions and restocks apart per drug and batch, and flags lines without allocations', () => {
        const p = pendingStock([
            { drugId: 'd', sign: -1, quantity: 3, batchAllocations: onBatch('b1', 3) },
            { drugId: 'd', sign: 1, quantity: 1, batchAllocations: onBatch('b1', 1) },
            { drugId: 'e', sign: -1, quantity: 2, batchAllocations: null },
        ]);
        expect(p.byDrug.get('d')?.get('b1')).toEqual({ out: 3, in: 1 });
        expect([...p.unallocatedDrugs]).toEqual(['e']);
    });
});
