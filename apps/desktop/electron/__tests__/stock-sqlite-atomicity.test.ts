import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
vi.mock('../db', () => ({ prisma: {} }));
vi.mock('../store', () => ({ default: { get: () => [] } }));
import * as validation from '../product-snapshot-validation';
import * as maps from '../product-sync-maps';
import * as diff from '../product-sync-diff';
import { planDrugStock, SYNTHETIC_BATCH_NUMBER } from '../stock-reconcile';
import { pendingStockInTx } from '../stock-pull';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../../node_modules/.prisma/desktop-client');
const source = fs.readFileSync(new URL('../sync.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function syncProductsExclusive()');
const helpers = source.slice(source.indexOf('const SQLITE_VAR_LIMIT'), source.indexOf('// Debug log file'));
const code = ts.transpileModule(helpers + '\n' + source.slice(start, source.indexOf('\n}', start) + 2), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'faramace-stock-atomicity-'));
let ddl: string;
beforeAll(() => {
  // Schema-to-SQL only: no database URL or external connection is used.
  ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema-datamodel', fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)), '--script'],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
}, 35000);
afterAll(() => {
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('Unexpected test directory');
  fs.rmSync(root, { recursive: true, force: true });
});
async function fixture(name: string) {
  const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(root, name + '.db').replace(/\\/g, '/')}` } } });
  for (const sql of ddl.split(';').map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(sql);
  await db.branch.create({ data: { id: 'branch', name: 'Isolated' } });
  await db.user.create({ data: { id: 'u', name: 'Test', email: 'test@invalid.local', password: 'unused', role: 'ADMIN', branchId: 'branch' } });
  await db.globalDrug.create({ data: { id: 'd', barcode: 'test', tradeName: 'Test', scientificName: 'Test', price: 1 } });
  await db.inventory.create({ data: { id: 'inv', drugId: 'd', branchId: 'branch', quantity: 7 } });
  await db.batch.create({ data: { id: 'old', inventoryId: 'inv', batchNumber: 'OLD', quantity: 7, expiryDate: new Date('2035-01-01') } });
  return db;
}
async function pull(db: any, batchId: string, quantity: number, pending = false, accepted = false) {
  const errors: unknown[] = [];
  const deps = { ...validation, ...maps, ...diff, pendingStockInTx, planDrugStock, SYNTHETIC_BATCH_NUMBER,
    beginSyncTask: () => true, endSyncTask: () => {}, checkConnection: async () => true, getBranchId: () => 'branch',
    readPendingStockIds: async () => ({ saleIds: pending ? ['sale'] : [], returnIds: [], protectedInventoryIds: new Set() }),
    queuedInventoryIds: () => new Set(), recordSyncSuccess: () => {}, prisma: db,
    fetchStockSnapshot: async () => ({ snapshot: { drugs: [{ id: 'd', inventoryId: 'inv', barcode: 'test', tradeName: 'Test', scientificName: 'Test', price: 100, stock: quantity,
      batches: [{ id: batchId, batchNumber: batchId, quantity, expiryDate: '2035-01-01', costPrice: 1 }] }] },
      applied: { saleIds: accepted ? ['sale'] : [], returnIds: [] }, fromCache: false }),
    console: { log: () => {}, warn: () => {}, error: (...args: unknown[]) => errors.push(args) },
  };
  const result = await new Function(...Object.keys(deps), code + ';return syncProductsExclusive();')(...Object.values(deps));
  return { result, errors };
}
async function quantities(db: any) {
  const inventory = await db.inventory.findUnique({ where: { id: 'inv' } });
  const batches = await db.batch.findMany({ where: { inventoryId: 'inv' }, orderBy: { id: 'asc' } });
  expect(inventory.quantity).toBe(batches.reduce((sum: number, b: any) => sum + b.quantity, 0));
  return { total: inventory.quantity, lots: batches.map((b: any) => [b.id, b.quantity]) };
}
it('keeps historical stocktake lots at zero and preserves pending allocations through repeated pulls', async () => {
  const db = await fixture('history');
  try {
    await db.stocktake.create({ data: { id: 'count', branchId: 'branch', userId: 'u', items: { create: {
      batchId: 'old', systemQuantity: 7, actualQuantity: 7, difference: 0, costPrice: 1,
    } } } });
    const allocation = JSON.stringify([{ batchId: 'old', quantity: 3 }]);
    await db.sale.create({ data: { id: 'sale', total: 3, items: { create: { drugId: 'd', quantity: 3, price: 1, batchAllocations: allocation } } } });
    for (let i = 0; i < 2; i++) {
      const r = await pull(db, 'new', 20, true);
      expect(r.errors).toEqual([]); expect(r.result.success).toBe(true);
      expect(await quantities(db)).toEqual({ total: 17, lots: [['new', 17], ['old', 0]] });
      expect((await db.stocktakeItem.findFirst()).actualQuantity).toBe(7);
      expect((await db.saleItem.findFirst()).batchAllocations).toBe(allocation);
    }
    expect((await pull(db, 'new', 17, true, true)).result.success).toBe(true);
    expect(await quantities(db)).toEqual({ total: 17, lots: [['new', 17], ['old', 0]] });
  } finally { await db.$disconnect(); }
});
it('rolls back the entire snapshot when a lot write fails after changing the inventory total', async () => {
  const db = await fixture('rollback');
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_lot_write BEFORE UPDATE ON Batch BEGIN SELECT RAISE(ABORT, 'audit write failure'); END`);
    const r = await pull(db, 'old', 20);
    expect(r.result.success).toBe(false); expect(r.errors.length).toBeGreaterThan(0);
    expect(await quantities(db)).toEqual({ total: 7, lots: [['old', 7]] });
    expect((await db.globalDrug.findUnique({ where: { id: 'd' } })).price).toBe(1);
  } finally { await db.$disconnect(); }
});
