import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
import { buildContext, extractDateRange } from '../app/lib/ai-assistant';
import { EXAMPLE_CATEGORIES } from '../app/lib/assistant-examples';
import { getDebtSummary, getSupplierDebts, getPendingOrders, getShiftSummary, getSlowMovingDrugs } from '../app/lib/ai-data';
import { getDefaultPermissions } from '../app/lib/permissions';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
afterAll(() => db.$disconnect());
const rollback = new Error('rollback fixture');
const now = new Date('2026-09-30T15:00:00Z');
const ar = (n: number) => n.toLocaleString('ar-IQ');
async function fixture(run: (tx: any, f: any) => Promise<void>) {
    try { await db.$transaction(async tx => {
        state.db = tx;
        const org = await tx.organization.create({ data: { name: 'FAQ ' + randomUUID() } });
        const other = await tx.organization.create({ data: { name: 'FOREIGN-FAQ' } });
        const a = await tx.branch.create({ data: { name: 'FAQ-A', organizationId: org.id } });
        const b = await tx.branch.create({ data: { name: 'FAQ-B', organizationId: org.id } });
        const foreign = await tx.branch.create({ data: { name: 'FOREIGN-FAQ', organizationId: other.id } });
        const user = await tx.user.create({ data: { email: randomUUID()+'@test.invalid', password: 'unused', name: 'FAQ-USER', role: 'ADMIN', branchId: a.id } });
        const drug = await tx.globalDrug.create({ data: { barcode: randomUUID(), tradeName: 'FAQ Medicine', scientificName: 'أسبرين', alternatives: [] } });
        const ctx = { organizationId: org.id, tenantBranchWhere: { branch: { organizationId: org.id } }, user: { id: user.id, role: 'ADMIN', branchId: a.id, organizationId: org.id }, tenantWhere: { organizationId: org.id }, branchModelWhere: { organizationId: org.id }, userPermissions: getDefaultPermissions('ADMIN') };
        for (const [date, total, quantity] of [ ['2026-09-30T00:00:00Z', 100, 3], ['2026-09-29T21:00:00Z', 50, 2], ['2026-09-29T20:59:59Z', 70, 7], ['2026-09-25T21:00:00Z', 60, 6], ['2026-09-20T12:00:00Z', 40, 4], ['2026-08-20T12:00:00Z', 80, 8], ['2026-04-20T12:00:00Z', 90, 9], ['2026-03-20T12:00:00Z', 110, 11] ] as const) await tx.sale.create({ data: { branchId: a.id, userId: user.id, total, createdAt: new Date(date), items: { create: { drugId: drug.id, price: 10, cost: 5, quantity } } } });
        await tx.sale.create({ data: { branchId: foreign.id, total: 999999, createdAt: now, items: { create: { drugId: drug.id, price: 999999, cost: 0, quantity: 99999 } } } });
        await run(tx, { org, other, a, b, foreign, user, drug, ctx });
        throw rollback;
    }, { timeout: 60000 }); } catch (e) { if (e !== rollback) throw e; }
}

describe('advertised assistant answers read the right real PostgreSQL data', () => {
    it('all eight sales examples include exact totals, invoices and units for their range', () => fixture(async (tx, f) => {
        for (const question of EXAMPLE_CATEGORIES[0].questions) {
            const { from, to } = extractDateRange(question, now);
            const where = { ...f.ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } };
            const expected = await tx.sale.aggregate({ where, _sum: { total: true }, _count: { id: true } });
            const units = await tx.saleItem.aggregate({ where: { sale: where }, _sum: { quantity: true } });
            const result = await buildContext(question, f.ctx, [], now);
            expect(result.context).toContain(`إجمالي المبيعات: ${ar(expected._sum.total ?? 0)} IQD`);
            expect(result.context).toContain(`عدد الفواتير: ${expected._count.id}`);
            expect(result.context).toContain(`إجمالي الكمية المباعة: ${ar(units._sum.quantity ?? 0)} وحدة`);
            expect(result.context).not.toContain(ar(999999));
        }
        expect((await buildContext('كم مبيعات اليوم؟', f.ctx, [], now)).context).toContain(`إجمالي المبيعات: ${ar(150)} IQD`);
        expect((await buildContext('ما إجمالي المبيعات لشهر نيسان؟', f.ctx, [], now)).context).toContain(`إجمالي المبيعات: ${ar(90)} IQD`);
    }));
    it('all other advertised examples load context without falling back to the dashboard', () => fixture(async (_tx, f) => {
        for (const category of EXAMPLE_CATEGORIES.slice(1)) for (const question of category.questions) {
            const result = await buildContext(question, f.ctx, [], now);
            expect(result.categories).not.toContain('general');
            expect(result.context).toMatch(/##/);
            expect(result.context).not.toContain('FOREIGN-FAQ');
        }
    }));
    it('debt totals cover every debtor and supplier while the displayed list stays capped', () => fixture(async (tx, f) => {
        for (let i=0; i<12; i++) {
            await tx.patient.create({ data: { branchId: f.a.id, name: 'FAQ-Patient-'+i, phone: 'test-'+randomUUID(), balance: 100 } });
            await tx.supplier.create({ data: { organizationId: f.org.id, name: 'FAQ-Supplier-'+i, balance: 200 } });
        }
        await tx.patient.create({ data: { branchId: f.foreign.id, name: 'FOREIGN-FAQ', phone: 'test-'+randomUUID(), balance: 999999 } });
        const patients = await getDebtSummary(f.ctx), suppliers = await getSupplierDebts(f.ctx);
        expect(patients).toContain(`إجمالي ديون جميع العملاء: ${ar(1200)} IQD (12 عميل)`);
        expect(patients).toContain(`إجمالي الديون المعروضة: ${ar(1000)} IQD`);
        expect(suppliers).toContain(`إجمالي المستحق للموردين: ${ar(2400)} IQD`);
        expect(suppliers).toContain('(12 مورد)');
        expect(patients).not.toContain('FOREIGN-FAQ');
    }));
    it('pending delivery reads only sent orders, excludes drafts/delivered/foreign, and counts beyond 20', () => fixture(async (tx, f) => {
        const warehouse = await tx.warehouse.create({ data: { name: 'FAQ-Warehouse' } });
        for (let i=0; i<22; i++) await tx.warehouseOrder.create({ data: { branchId: f.a.id, warehouseId: warehouse.id, status: 'SENT' } });
        for (const status of ['DRAFT','DELIVERED','REJECTED','CANCELLED'] as const) await tx.warehouseOrder.create({ data: { branchId: f.a.id, warehouseId: warehouse.id, status } });
        await tx.warehouseOrder.create({ data: { branchId: f.foreign.id, warehouseId: warehouse.id, status: 'SENT' } });
        const result = await getPendingOrders(f.ctx);
        expect(result).toContain('(22 طلب)');
        expect(result).toContain('أحدث 20 طلباً');
        expect(result.split('\n').filter(x => x.startsWith('- '))).toHaveLength(20);
    }));
    it('current shift includes a still-open shift started yesterday and its cash balances', () => fixture(async (tx, f) => {
        const yesterday = new Date(now.getTime()-86400000);
        await tx.shift.create({ data: { branchId: f.a.id, userId: f.user.id, startTime: yesterday, status: 'OPEN', startingCash: 20, expectedCash: 250 } });
        const range = extractDateRange('اليوم', now);
        const result = await getShiftSummary(range.from, range.to, f.ctx, true);
        expect(result).toContain('FAQ-USER');
        expect(result).toContain(`المتوقع: ${ar(250)} IQD`);
    }));
    it('slow movers keep sales in their own branch and scientific-name search finds a medicine', () => fixture(async (tx, f) => {
        const slowDrug = await tx.globalDrug.create({ data: { barcode: randomUUID(), tradeName: 'FAQ Slow Medicine', scientificName: 'slow', alternatives: [] } });
        const searchable = await tx.inventory.create({ data: { branchId: f.a.id, drugId: f.drug.id, price: 10, cost: 5 } });
        for (const branchId of [f.a.id, f.b.id]) {
            const inv = await tx.inventory.create({ data: { branchId, drugId: slowDrug.id, price: 10, cost: 5 } });
            await tx.batch.create({ data: { inventoryId: inv.id, batchNumber: randomUUID(), quantity: 10, initialQuantity: 10, costPrice: 5, expiryDate: new Date(Date.now()+86400000*90) } });
        }
        await tx.sale.create({ data: { branchId: f.b.id, total: 1000, items: { create: { drugId: slowDrug.id, quantity: 1000, price: 1, cost: 0 } } } });
        const slow = await getSlowMovingDrugs(f.ctx);
        expect(slow).toContain('FAQ-A'); expect(slow).not.toContain('FAQ-B');
        const info = await buildContext('ما تكلفة الأسبرين؟', f.ctx, [], now);
        expect(info.context).toContain('FAQ Medicine');
        expect(info.context).toContain(`التكلفة: ${ar(5)} IQD`);
        expect(info.categories).toEqual(['drug_info']);
    }));
    it('unnamed individual patient/supplier questions request clarification', () => fixture(async (_tx, f) => {
        for (const question of ['كم دين المريض؟','ما ديون المورد؟']) expect((await buildContext(question, f.ctx, [], now)).context).toContain('توضيح مطلوب');
    }));
});
