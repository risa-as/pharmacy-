import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
import { buildContext, extractDateRange } from '../app/lib/ai-assistant';
import { EXAMPLE_CATEGORIES } from '../app/lib/assistant-examples';
import { getDebtSummary, getSupplierDebts, getPendingOrders, getShiftSummary, getSlowMovingDrugs, getSuspiciousActivity, getNamedDebt, getDrugInfo, getInventoryOverview, getLowStockItems } from '../app/lib/ai-data';
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
    it('review indicators distinguish price rises, cuts and exact discount boundaries and exclude foreign records', () => fixture(async (tx, f) => {
        const sale = (data: any) => tx.sale.create({ data: { branchId: f.a.id, userId: f.user.id, createdAt: now, ...data } });
        await sale({ total: 900, discount: 100 });
        await sale({ total: 800, discount: 200 });
        await sale({ total: 120, hasPriceOverride: true, items: { create: { drugId: f.drug.id, price: 120, originalPrice: 100, quantity: 1, cost: 5 } } });
        await sale({ total: 80, hasPriceOverride: true, items: { create: { drugId: f.drug.id, price: 80, originalPrice: 100, quantity: 1, cost: 5 } } });
        await tx.sale.create({ data: { branchId: f.foreign.id, total: 1, discount: 999999, hasPriceOverride: true, createdAt: now } });
        const text = await getSuspiciousActivity(new Date('2026-09-29T21:00:00Z'), now, f.ctx);
        expect(text.split('\n').filter(line => line.startsWith('- فاتورة'))).toHaveLength(3);
        expect(text).toContain('رفع 20.0%'); expect(text).toContain('خفض 20.0%');
        expect(text).not.toContain('خفض -'); expect(text).not.toContain(ar(999999));
        expect(text).toContain('20.0% > الحد 10%');
        expect(text).toContain('ليست إثباتاً');
    }));
    it('repeated returns mean multiple returns on one invoice within the scoped period', () => fixture(async (tx, f) => {
        const make = (branchId: string) => tx.sale.create({ data: { branchId, total: 100, createdAt: now } });
        const repeated = await make(f.a.id), single = await make(f.a.id), foreign = await make(f.foreign.id);
        for (const [s, n] of [[repeated, 2], [single, 1], [foreign, 3]] as const) for (let i=0;i<n;i++) await tx.saleReturn.create({ data: { saleId:s.id, branchId:s.branchId, total:1, createdAt:now } });
        const text = await getSuspiciousActivity(new Date('2026-09-29T21:00:00Z'), now, f.ctx);
        expect(text).toContain('وُجد 1 فاتورة لها أكثر من مرتجع واحد');
        expect(text).toContain('ليس قياساً عاماً لمعدل المرتجعات');
    }));
    it('filters all discount candidates before limiting the review list and respects dates', () => fixture(async (tx, f) => {
        await tx.sale.create({ data: { branchId:f.a.id, total:800, discount:200, createdAt:new Date('2026-09-29T22:00:00Z') } });
        for(let i=0;i<25;i++) await tx.sale.create({ data: { branchId:f.a.id, total:990, discount:10, createdAt:now } });
        await tx.sale.create({ data: { branchId:f.a.id, total:100, hasPriceOverride:true, createdAt:new Date('2026-09-29T20:59:59Z') } });
        const text = await getSuspiciousActivity(new Date('2026-09-29T21:00:00Z'), now, f.ctx);
        expect(text.split('\n').filter(line => line.startsWith('- فاتورة'))).toHaveLength(1);
        expect(text).toContain('20.0%');
    }));
    it('named debts read only the requested ledger and reject ambiguous names', () => fixture(async (tx, f) => {
        for (const [branchId,name,balance] of [[f.a.id,'أحمد علي',123],[f.a.id,'أحمد حسن',456],[f.foreign.id,'أحمد علي',999999]] as const) await tx.patient.create({data:{branchId,name,balance,phone:randomUUID()}});
        const exact=await getNamedDebt('أحمد علي','patient',f.ctx);
        expect(exact).toContain(ar(123)); expect(exact).not.toContain(ar(456)); expect(exact).not.toContain(ar(999999));
        expect(await getNamedDebt('أحمد','patient',f.ctx)).toContain('أكثر من سجل');
        await tx.supplier.create({data:{organizationId:f.org.id,name:'مذخر التفوق',balance:321}});
        expect((await buildContext('ما ديون المورد مذخر التفوق؟',f.ctx)).context).toContain(ar(321));
        expect((await buildContext('أحمد علي',f.ctx,[{role:'user',content:'كم دين المريض؟'}])).context).toContain(ar(123));
    }));
    it('Arabic search finds an English scientific or trade name within its tenant', () => fixture(async (tx, f) => {
        const drug=await tx.globalDrug.create({data:{barcode:randomUUID(),tradeName:'Panadol Extra',scientificName:'Paracetamol',alternatives:[]}});
        await tx.inventory.create({data:{branchId:f.a.id,drugId:drug.id,price:2500,cost:1000}});
        await tx.inventory.create({data:{branchId:f.foreign.id,drugId:drug.id,price:999999,cost:999999}});
        for(const term of ['باراسيتامول','بندول']){
            const text=await getDrugInfo(term,f.ctx);expect(text).toContain('Panadol Extra');expect(text).toContain(ar(2500));expect(text).not.toContain(ar(999999));
        }
        expect(await getDrugInfo('Unknown medicine',f.ctx)).toContain('لا يثبت غياب المادة');
    }));
    it('return counts and sums exclude another tenant and separate the previous period', () => fixture(async (tx, f) => {
        const sale=await tx.sale.create({data:{branchId:f.a.id,total:100,createdAt:now}});
        for(const [date,total] of [[now,10],[now,20],[new Date('2026-09-28T23:00:00Z'),5]] as const)await tx.saleReturn.create({data:{saleId:sale.id,branchId:f.a.id,total,createdAt:date}});
        const text=await getSuspiciousActivity(new Date('2026-09-29T21:00:00Z'),new Date('2026-09-30T20:59:59.999Z'),f.ctx);
        expect(text).toContain('عدد عمليات الإرجاع خلال الفترة: 2');expect(text).toContain('إجمالي المبلغ المرتجع: '+ar(30));expect(text).toContain('1 عملية');
    }));
    it('catalog candidates stay tenant scoped and require selection before prices', () => fixture(async (tx,f)=>{
        const drug=await tx.globalDrug.create({data:{barcode:randomUUID(),tradeName:'Lipitor 20',scientificName:'Atorvastatin',alternatives:[]}});
        await tx.inventory.create({data:{branchId:f.a.id,drugId:drug.id,price:4500,cost:2000}});
        const foreign=await tx.globalDrug.create({data:{barcode:randomUUID(),tradeName:'Lipitorr Foreign',scientificName:'Atorvastatin',alternatives:[]}});
        await tx.inventory.create({data:{branchId:f.foreign.id,drugId:foreign.id,price:999999,cost:999999}});
        const result=await buildContext('هل عدنا ليبيتور؟',f.ctx,[],now);
        expect(result.directResponse).toContain('Lipitor 20');
        expect(result.directResponse).not.toContain('Foreign');
        expect(result.directResponse).not.toContain(ar(4500));
        const selected=await buildContext('1',f.ctx,[{role:'assistant',content:result.directResponse!}],now);
        expect(selected.context).toContain(ar(4500));
        expect(selected.context).not.toContain(ar(999999));
        expect(await getDrugInfo('ليبيتور 40',f.ctx)).not.toContain('Lipitor 20');
        expect(await getDrugInfo('1234567890123',f.ctx)).not.toContain('Lipitor 20');
    }));
    it('inventory distinct counts do not duplicate drugs across branches', () => fixture(async (tx,f)=>{
        for(const branchId of [f.a.id,f.b.id])await tx.inventory.create({data:{branchId,drugId:f.drug.id,price:10,cost:5}});
        const text=await getInventoryOverview(f.ctx);expect(text).toContain('المسجّلة: 1 صنف');expect(text).toContain('حسب الفروع: 2 سجل');
    }));
    it('low stock distinguishes unique medicines from branch shortages', () => fixture(async (tx,f)=>{
        for(const branchId of [f.a.id,f.b.id])await tx.inventory.create({data:{branchId,drugId:f.drug.id,price:10,cost:5,minStock:5}});
        expect(await getLowStockItems(f.ctx)).toContain('1 صنف مختلف، 2 سجل نقص حسب الفروع');
    }));
});
