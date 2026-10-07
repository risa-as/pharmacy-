import { afterAll, expect, it, vi } from 'vitest';
import { PrismaClient, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { buildInventoryCountsQuery, buildInventoryPageIdsQuery } from '../app/lib/inventory-dashboard-query';
import { buildMobileInventoryQuery } from '../app/lib/mobile-inventory-query';
import { buildSalesByLocalDateQuery } from '../app/lib/report-sales-aggregates';
import { nextDocumentReference } from '../app/lib/document-reference';
import { requestWarehouseReturn } from '../app/lib/warehouse-return-settlement';

const state = vi.hoisted(() => ({ db: null as any, tenant: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.tenant }));
import { loadWarehouseStock } from '../app/lib/warehouse-stock-data';
import { listPharmacyReturns } from '../app/lib/warehouse-return-list';
import { GET as profitReport } from '../app/api/reports/profit-analysis/route';

// The integration config rejects all nonlocal targets. Never use DATABASE_URL here.
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
afterAll(() => db.$disconnect());
const rollback = new Error('TEST_ROLLBACK');
async function isolated(run: (tx: Prisma.TransactionClient, f: any) => Promise<void>) {
    try {
        await db.$transaction(async tx => {
            await tx.$executeRawUnsafe("SET LOCAL search_path = ''");
            const path = await tx.$queryRaw<{ path: string }[]>`SELECT current_setting('search_path') AS path`;
            expect(['', '""']).toContain(path[0].path);
            // Real Prisma queries run on the same connection as the empty path.
            state.db = new Proxy(tx, { get(target, prop) {
                if (prop === '$transaction') return (fn: any) => fn(tx);
                const value = Reflect.get(target, prop);
                return typeof value === 'function' ? value.bind(target) : value;
            } });
            const org = await tx.organization.create({ data: { name: 'Search path test' } });
            const other = await tx.organization.create({ data: { name: 'Other tenant' } });
            const branch = await tx.branch.create({ data: { name: 'Main', organizationId: org.id } });
            const foreign = await tx.branch.create({ data: { name: 'Foreign', organizationId: other.id } });
            const drug = await tx.globalDrug.create({ data: { barcode: randomUUID(), tradeName: 'Path medicine', scientificName: 'Test', alternatives: [] } });
            const inventory = await tx.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 10, cost: 4, minStock: 10 } });
            const expiryDate = new Date(Date.now() + 30 * 86400000);
            const batch = await tx.batch.create({ data: { inventoryId: inventory.id, quantity: 6, initialQuantity: 6, batchNumber: 'PATH', costPrice: 4, expiryDate } });
            await tx.inventory.create({ data: { branchId: foreign.id, drugId: drug.id, price: 999, cost: 999 } });
            const warehouse = await tx.warehouse.create({ data: { name: 'Path warehouse' } });
            state.tenant = { tenantBranchWhere: { branch: { organizationId: org.id } }, userPermissions: { canViewProfitReport: true, canViewInventory: true } };
            await run(tx, { org, other, branch, foreign, drug, inventory, batch, warehouse, expiryDate });
            expect(['', '""']).toContain((await tx.$queryRaw<{ path: string }[]>`SELECT current_setting('search_path') AS path`)[0].path);
            throw rollback;
        }, { timeout: 30000 });
    } catch (e) { if (e !== rollback) throw e; }
}

it('executes composed inventory CTEs and mobile filtering with an empty path and tenant scope', () => isolated(async (tx, f) => {
    const opts = { page: 1, query: 'Path', status: 'low', tenantBranchWhere: { branch: { organizationId: f.org.id } }, branchId: f.branch.id };
    const counts = await tx.$queryRaw<any[]>(buildInventoryCountsQuery(opts));
    const ids = await tx.$queryRaw<any[]>(buildInventoryPageIdsQuery(opts));
    expect(counts[0].total).toBe(1);
    expect(ids.map(x => x.id)).toEqual([f.inventory.id]);
    for (const sort of ['quantity', 'expiry', 'name']) {
        const mobile = await tx.$queryRaw<any[]>(buildMobileInventoryQuery(new URLSearchParams({ search: 'Path', status: 'low-stock', sort, direction: 'desc' }), opts.tenantBranchWhere));
        expect(mobile[0].ids).toEqual([f.inventory.id]);
        expect(mobile[0].totalValue).toBe(60);
        expect(mobile[0].items).toEqual([{
            id: f.inventory.id, drugId: f.drug.id, branchId: f.branch.id,
            barcode: f.drug.barcode, drugName: 'Path medicine', tradeName: 'Path medicine',
            scientificName: 'Test', quantity: 6, expiryDate: f.expiryDate.toISOString(),
            price: 10, reorderLevel: 10, isQuickSale: false,
        }]);
    }
}));

it('mobile inventory rows match Prisma batch quantities and expiry while zero and negative batches remain accounted for', () => isolated(async (tx, f) => {
    await tx.batch.create({ data: { inventoryId: f.inventory.id, quantity: 0, initialQuantity: 0, batchNumber: 'EMPTY', costPrice: 4, expiryDate: new Date('2000-01-01') } });
    await tx.batch.create({ data: { inventoryId: f.inventory.id, quantity: -2, initialQuantity: 0, batchNumber: 'NEGATIVE', costPrice: 4, expiryDate: new Date('2001-01-01') } });
    const [result] = await tx.$queryRaw<any[]>(buildMobileInventoryQuery(new URLSearchParams(), state.tenant.tenantBranchWhere));
    const old = await tx.inventory.findMany({ where: state.tenant.tenantBranchWhere, include: { drug: true, batches: true } });
    expect(result.items).toHaveLength(old.length);
    expect(result.items[0]).toMatchObject({ quantity: old[0].batches.reduce((sum, b) => sum + b.quantity, 0), expiryDate: f.expiryDate.toISOString(), price: old[0].price });
    expect(result.totalValue).toBe(40);
    const [foreign] = await tx.$queryRaw<any[]>(buildMobileInventoryQuery(new URLSearchParams({ branchId: f.foreign.id }), state.tenant.tenantBranchWhere));
    expect(foreign.items).toEqual([]); expect(foreign.total).toBe(0); expect(foreign.counts.all).toBe(0);
}));

it('mobile inventory uses ordered pagination without omitting rows or changing the full scoped total', () => isolated(async (tx, f) => {
    const drugs = Array.from({ length: 52 }, (_, i) => ({ id: randomUUID(), barcode: randomUUID(), tradeName: `Paged ${String(i).padStart(2, '0')}`, scientificName: 'Test', alternatives: [] }));
    await tx.globalDrug.createMany({ data: drugs });
    await tx.inventory.createMany({ data: drugs.map(d => ({ drugId: d.id, branchId: f.branch.id, price: 10, cost: 4 })) });
    const scope = state.tenant.tenantBranchWhere;
    const [first] = await tx.$queryRaw<any[]>(buildMobileInventoryQuery(new URLSearchParams({ search: 'Paged', page: '1' }), scope));
    const [second] = await tx.$queryRaw<any[]>(buildMobileInventoryQuery(new URLSearchParams({ search: 'Paged', page: '2' }), scope));
    expect(first.items.map((i: any) => i.drugName)).toEqual(drugs.slice(0, 50).map(d => d.tradeName));
    expect(second.items.map((i: any) => i.drugName)).toEqual(drugs.slice(50).map(d => d.tradeName));
    expect(first.total).toBe(52); expect(second.total).toBe(52);
    expect(first.totalValue).toBe(60); expect(second.totalValue).toBe(60);
}));

it('executes the composed daily sales query and real document helper', () => isolated(async (tx, f) => {
    const sale = await tx.sale.create({ data: { branchId: f.branch.id, total: 25 } });
    await tx.sale.create({ data: { branchId: f.foreign.id, total: 999 } });
    expect(sale.documentNumber).toMatch(/^INV-/);
    expect(sale.invoiceOrganizationId).toBe(f.org.id);
    expect(await nextDocumentReference(tx, 'PIN')).toMatch(/^PIN-/);
    const result = await tx.$queryRaw<any[]>(buildSalesByLocalDateQuery({ tenantBranchWhere: { branch: { organizationId: f.org.id } }, start: new Date(0), timeZone: 'Asia/Baghdad' }));
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(25);
}));

it('executes warehouse stock count and page fragments through the real loader', () => isolated(async (tx, f) => {
    const item = await tx.warehouseCatalogItem.create({ data: { warehouseId: f.warehouse.id, drugId: f.drug.id, barcode: f.drug.barcode, price: 10, minStock: 10 } });
    await tx.warehouseBatch.create({ data: { catalogItemId: item.id, batchNumber: 'PATH', expiryDate: f.expiryDate, quantity: 6, initialQuantity: 6, costPrice: 4 } });
    for (const filter of ['', 'low', 'expiring']) {
        const result = await loadWarehouseStock(f.warehouse.id, true, 'Path', filter);
        expect(result.total).toBe(1);
        expect(result.items[0].id).toBe(item.id);
        expect(result.items[0].sellableQuantity).toBe(6);
    }
}));

it('executes return list/count fragments and the credit-note trigger', () => isolated(async (tx, f) => {
    const order = await tx.warehouseOrder.create({ data: { warehouseId: f.warehouse.id, branchId: f.branch.id } });
    expect(order.orderNumber).toMatch(/^WAI-/);
    const ret = await tx.warehouseReturn.create({ data: { orderId: order.id, warehouseId: f.warehouse.id, organizationId: f.org.id, status: 'ACCEPTED', totalAmount: 12, reason: 'path review' } });
    expect(ret.creditNoteNumber).toMatch(/^WCN-/);
    const result = await listPharmacyReturns({ role: 'ADMIN', organizationId: f.org.id }, new URLSearchParams({ search: 'path', branchId: f.branch.id, returnStatus: 'ACCEPTED' }));
    expect(result.returns.map(x => x.id)).toEqual([ret.id]);
    expect(Number(result.counts.ACCEPTED)).toBe(1);
    const updated = await tx.warehouseReturn.update({ where: { id: ret.id }, data: { reason: 'updated' } });
    expect(updated.creditNoteNumber).toBe(ret.creditNoteNumber);
}));

it('executes the profit route with real joined conditions and window totals', () => isolated(async (_tx, f) => {
    const result = await profitReport(new Request(`http://localhost/api/reports/profit-analysis?branchId=${f.branch.id}`));
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.summary.deadStockCount).toBe(1);
    expect(body.summary.totalDeadStockValue).toBe(24);
    expect(body.deadStock[0].drugId).toBe(f.drug.id);
}));

it('executes composed VALUES stock reservation with multiple batches, without double stock changes', () => isolated(async (tx, f) => {
    const supplier = await tx.supplier.create({ data: { name: 'Path supplier', organizationId: f.org.id } });
    const order = await tx.warehouseOrder.create({ data: { warehouseId: f.warehouse.id, branchId: f.branch.id, status: 'DELIVERED', totalAmount: 60,
        items: { create: { drugId: f.drug.id, quantity: 6, unitPrice: 10, quotedPrice: 10, status: 'AVAILABLE', unitsPerPack: 1 } } } });
    const purchase = await tx.purchase.create({ data: { warehouseOrderId: order.id, branchId: f.branch.id, supplierId: supplier.id, total: 24, status: 'COMPLETED', items: { create: { drugId: f.drug.id, quantity: 6, cost: 4 } } }, include: { items: true } });
    await tx.batch.update({ where: { id: f.batch.id }, data: { quantity: 2, supplierId: supplier.id, purchaseItemId: purchase.items[0].id } });
    const second = await tx.batch.create({ data: { inventoryId: f.inventory.id, quantity: 2, initialQuantity: 2, batchNumber: 'PATH-2', expiryDate: f.expiryDate, supplierId: supplier.id, purchaseItemId: purchase.items[0].id } });
    const result = await requestWarehouseReturn(tx, order.id, { branchId: f.branch.id }, { items: [{ barcode: f.drug.barcode, quantity: 3 }], reason: 'test' }, null);
    expect(result.return.totalAmount).toBe(30);
    const batches = await tx.batch.findMany({ where: { id: { in: [f.batch.id, second.id] } } });
    expect(batches.reduce((n, b) => n + b.quantity, 0)).toBe(1);
}));

it('refreshes invoice scope on a branch move with an empty path', () => isolated(async (tx, f) => {
    const sale = await tx.sale.create({ data: { branchId: f.branch.id, total: 1 } });
    await tx.branch.update({ where: { id: f.branch.id }, data: { organizationId: f.other.id } });
    expect((await tx.sale.findUniqueOrThrow({ where: { id: sale.id } })).invoiceOrganizationId).toBe(f.other.id);
}));

it('negative controls reproduce old SQL and unpinned functions without changing the shared test database', () => isolated(async (tx, f) => {
    const query = buildMobileInventoryQuery(new URLSearchParams(), { branchId: f.branch.id });
    await tx.$executeRawUnsafe('SAVEPOINT old_sql');
    await expect(tx.$queryRawUnsafe(query.text.replaceAll('"public".', ''), ...query.values)).rejects.toThrow(/does not exist/);
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT old_sql');
    for (const signature of ['next_document_reference(text)', 'next_warehouse_order_number()', 'next_warehouse_credit_note()', 'enforce_sale_invoice_scope()']) {
        await tx.$executeRawUnsafe(`ALTER FUNCTION public.${signature} RESET search_path`);
    }
    for (const sql of ["SELECT public.next_document_reference('INV')", 'SELECT public.next_warehouse_order_number()', 'SELECT public.next_warehouse_credit_note()']) {
        await tx.$executeRawUnsafe('SAVEPOINT old_function');
        await expect(tx.$queryRawUnsafe(sql)).rejects.toThrow(/does not exist/);
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT old_function');
    }
    await tx.$executeRawUnsafe('SAVEPOINT old_trigger');
    await expect(tx.sale.create({ data: { branchId: f.branch.id, total: 1, documentNumber: `CONTROL-${randomUUID()}` } })).rejects.toThrow(/Branch.*does not exist/);
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT old_trigger');
    // isolated() rolls back the function changes as well as all fixtures.
}));
