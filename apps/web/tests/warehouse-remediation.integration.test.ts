import { getDefaultPermissions } from '../app/lib/permissions';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ tenant: null as any, warehouse: null as any, db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.tenant }));
vi.mock('@/app/lib/warehouse-context', () => ({ getWarehouseContext: async () => state.warehouse }));
import { PATCH as custodyReturn, GET as pharmacyReturns } from '../app/api/warehouses/orders/[id]/returns/route';
import { POST as proposeMatch } from '../app/api/warehouse-portal/invoices/[id]/reconciliation/route';
import { POST as reconcile, GET as reconciliationData } from '../app/api/warehouses/orders/[id]/reconciliation/route';
import { POST as settleOpening, GET as settlements } from '../app/api/warehouse-portal/settlements/route';
import { PATCH as customerTerms } from '../app/api/warehouse-portal/customers/[id]/route';
import { POST as requestReturn } from '../app/api/warehouses/orders/[id]/returns/route';
import { POST as changeOrder } from '../app/api/warehouses/orders/[id]/route';
import { PATCH as decideReturn } from '../app/api/warehouse-portal/returns/[id]/route';
import { POST as inspectReturn } from '../app/api/warehouse-portal/returns/[id]/inspection/route';
import { POST as refundReturn } from '../app/api/warehouse-portal/returns/[id]/refund/route';
import { POST as paySupplier } from '../app/api/warehouse-portal/purchases/[id]/payments/route';
import { POST as sell } from '../app/api/warehouse-portal/reps/[id]/sales/route';
import { POST as collect } from '../app/api/warehouse-portal/reps/[id]/collections/route';
import { POST as load } from '../app/api/warehouse-portal/reps/[id]/load/route';
import { POST as adjust } from '../app/api/warehouse-portal/stock/adjust/route';
import { POST as importCatalog } from '../app/api/warehouse-portal/catalog/import/route';
import { DELETE as archive } from '../app/api/warehouse-portal/catalog/route';
import { GET as invoices } from '../app/api/warehouse-portal/invoices/route';
import { GET as purchases } from '../app/api/warehouse-portal/purchases/route';
import { GET as listReturns } from '../app/api/warehouse-portal/returns/route';
import { loadOpenReceivables } from '../app/lib/warehouse-receivables';
import { loadWarehouseStock } from '../app/lib/warehouse-stock-data';
import { getSoldLines, getRepPerformance } from '../app/lib/warehouse-report-data';
import { summarizeReceivables } from '../app/lib/warehouse-accounts';
import { salesByPeriod } from '../app/lib/warehouse-reports';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); state.db = db;
const req = (body: unknown, url = 'http://localhost/api/test') => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
let f: any;
beforeEach(async () => {
    const key = randomUUID();
    const org = await db.organization.create({ data: { name: `Test ${key}` } });
    const branch = await db.branch.create({ data: { name: 'Branch', organizationId: org.id } });
    const warehouse = await db.warehouse.create({ data: { name: key, operatingMode: 'FULL' } });
    const owner = await db.user.create({ data: { email: `${key}@test.invalid`, password: 'not-a-login-password', role: 'WAREHOUSE', warehouseId: warehouse.id, warehouseUserType: 'OWNER' } });
    const supplier = await db.supplier.create({ data: { name: 'Supplier', organizationId: org.id, warehouseId: warehouse.id, balance: 1000 } });
    const drug = await db.globalDrug.create({ data: { barcode: key, tradeName: 'Medicine', scientificName: 'Test', alternatives: [] } });
    const catalog = await db.warehouseCatalogItem.create({ data: { warehouseId: warehouse.id, drugId: drug.id, barcode: key, price: 100, costPrice: 40 } });
    const expiryDate = new Date('2030-01-01');
    const batch = await db.warehouseBatch.create({ data: { catalogItemId: catalog.id, batchNumber: 'LOT-1', expiryDate, quantity: 100, initialQuantity: 110, costPrice: 40 } });
    const order = await db.warehouseOrder.create({ data: { warehouseId: warehouse.id, branchId: branch.id, status: 'DELIVERED', totalAmount: 1000,
        items: { create: { drugId: drug.id, quantity: 10, unitPrice: 100, quotedPrice: 100, status: 'AVAILABLE', unitsPerPack: 2 } },
        events: { create: { actorType: 'WAREHOUSE', type: 'SHIPPED' } } } });
    const invoice = await db.warehouseInvoice.create({ data: { warehouseId: warehouse.id, organizationId: org.id, orderId: order.id, invoiceNumber: key, total: 1000 } });
    await db.warehouseStockMove.create({ data: { catalogItemId: catalog.id, batchId: batch.id, orderId: order.id, type: 'SHIPMENT', quantity: 10, unitCost: 40 } });
    const purchase = await db.purchase.create({ data: { branchId: branch.id, supplierId: supplier.id, warehouseOrderId: order.id, total: 1000, status: 'COMPLETED',
        items: { create: { drugId: drug.id, quantity: 20, cost: 50 } } }, include: { items: true } });
    const inventory = await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 60, cost: 50 } });
    const pharmacyBatch = await db.batch.create({ data: { inventoryId: inventory.id, purchaseItemId: purchase.items[0].id, supplierId: supplier.id,
        quantity: 20, initialQuantity: 20, batchNumber: 'LOT-1', expiryDate, costPrice: 50 } });
    const rep = await db.warehouseRep.create({ data: { warehouseId: warehouse.id, name: 'Rep' } });
    await db.warehouseRepStock.create({ data: { repId: rep.id, batchId: batch.id, quantity: 10 } });
    const wholesaleSupplier = await db.warehouseSupplier.create({ data: { warehouseId: warehouse.id, name: 'Wholesaler' } });
    const payable = await db.warehousePurchase.create({ data: { warehouseId: warehouse.id, supplierId: wholesaleSupplier.id, invoiceNumber: key, total: 1000 } });
    f = { org, branch, warehouse, owner, supplier, drug, catalog, batch, order, invoice, purchase, pharmacyBatch, rep, payable };
    state.tenant = { organizationId: org.id, tenantBranchWhere: { branchId: branch.id }, branchModelWhere: { id: branch.id }, userPermissions: getDefaultPermissions('ADMIN'), user: { id: owner.id, name: 'Tester', role: 'ADMIN', branchId: branch.id } };
    state.warehouse = { warehouseId: warehouse.id, user: { id: owner.id, role: 'WAREHOUSE', name: 'Tester' } };
});
afterAll(() => db.$disconnect());
async function createReturn(quantity: number, key = randomUUID()) {
    return requestReturn(req({ idempotencyKey: key, items: [{ barcode: f.drug.barcode, quantity }], reason: 'Test return' }), params(f.order.id));
}
async function accepted(quantity: number) {
    const created = await createReturn(quantity); expect(created.status).toBe(201);
    const record = (await created.json()).return;
    const response = await decideReturn(req({ action: 'ACCEPTED' }), params(record.id));
    expect(await response.clone().json()).not.toHaveProperty('error'); expect(response.status).toBe(200);
    return (await response.json()).return;
}

describe('warehouse remediation on isolated PostgreSQL', () => {
    it('resolves a return-only period from the original order without a catalog entry', async () => {
        const drug=await db.globalDrug.create({data:{barcode:randomUUID(),tradeName:'Legacy portal medicine',scientificName:'Test',alternatives:[]}});
        await db.warehouseOrderItem.create({data:{warehouseOrderId:f.order.id,drugId:drug.id,quantity:2,unitPrice:100,status:'AVAILABLE'}});
        await db.warehouseReturn.create({data:{warehouseId:f.warehouse.id,orderId:f.order.id,organizationId:f.org.id,status:'ACCEPTED',acceptedAt:new Date('2025-01-02'),items:{create:{drugId:drug.id,barcode:drug.barcode,quantity:1,unitPrice:100}}}});
        const lines=await getSoldLines(f.warehouse.id,{from:new Date('2025-01-01'),to:new Date('2025-01-03')});
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({tradeName:'Legacy portal medicine',lineTotal:-100,isReturn:true});
    });
    it('blocks a second pending return even with a fresh key and enough remaining stock', async () => {
        expect((await createReturn(1)).status).toBe(201);
        const repeated = await createReturn(1);
        expect(repeated.status).toBe(409);
        expect((await repeated.json()).error).toContain('قيد المراجعة');
        expect((await db.batch.findUniqueOrThrow({where:{id:f.pharmacyBatch.id}})).quantity).toBe(18);
        expect(await db.warehouseReturn.count({where:{orderId:f.order.id}})).toBe(1);
    });
    it('reserves multiple receipt batches atomically and records their exact allocation', async () => {
        const original = await db.batch.findUniqueOrThrow({where:{id:f.pharmacyBatch.id}});
        await db.batch.update({where:{id:original.id},data:{quantity:10,initialQuantity:10}});
        const extra = await db.batch.create({data:{inventoryId:original.inventoryId,purchaseItemId:original.purchaseItemId,supplierId:original.supplierId,expiryDate:original.expiryDate,batchNumber:'split-receipt',quantity:10,initialQuantity:10,costPrice:original.costPrice}});
        const response = await createReturn(6);expect(response.status).toBe(201);
        const result = await response.json();
        const allocations = result.return.items[0].pharmacyAllocations;
        expect(allocations).toHaveLength(2);
        expect(allocations.reduce((sum:number,row:any)=>sum+row.quantity,0)).toBe(12);
        const total = await db.batch.aggregate({where:{id:{in:[original.id,extra.id]}},_sum:{quantity:true}});
        expect(total._sum.quantity).toBe(8);
    });

    it('distinguishes unlinked legacy receipt batches from stock shortages without reserving inventory', async () => {
        await db.batch.update({ where: { id: f.pharmacyBatch.id }, data: { purchaseItemId: null } });
        const result = await createReturn(1);
        expect(result.status).toBe(409);
        expect((await result.json()).error).toContain('غير مربوطة');
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(20);
        expect(await db.warehouseReturn.count({ where: { orderId: f.order.id } })).toBe(0);
    });
    it('reports stock-unit availability when a linked batch has been exhausted', async () => {
        await db.batch.update({ where: { id: f.pharmacyBatch.id }, data: { quantity: 0 } });
        const result = await createReturn(1);
        expect(result.status).toBe(409);
        const {error} = await result.json();
        expect(error).toContain('المطلوب 2'); expect(error).toContain('المتاح 0');
        expect(error).not.toContain('غير مربوطة');
    });

    it('replays concurrent identical return requests and reserves strips once', async () => {
        const key = randomUUID();
        const responses = await Promise.all([createReturn(6,key), createReturn(6,key)]);
        expect(responses.map(r => r.status)).toEqual([201,201]);
        expect(await db.warehouseReturn.count({ where: { orderId: f.order.id } })).toBe(1);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(8);
        expect((await createReturn(4,key)).status).toBe(409);
    });
    it('serializes different pending return keys against remaining shipped quantity', async () => {
        const responses = await Promise.all([createReturn(6),createReturn(6)]);
        expect(responses.map(r => r.status).sort()).toEqual([201,409]);
        expect(await db.warehouseReturn.count({ where: { orderId: f.order.id } })).toBe(1);
    });
    it('rolls back reservation on missing original stock and rejects cross-tenant access', async () => {
        await db.batch.update({ where: { id: f.pharmacyBatch.id }, data: { quantity: 3 } });
        expect((await createReturn(2)).status).toBe(409);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(3);
        expect(await db.warehouseReturn.count({ where: { orderId: f.order.id } })).toBe(0);
        state.tenant.organizationId = randomUUID();
        expect((await createReturn(1)).status).toBe(404);
    });
    it('keeps rejected stock reserved until explicit physical receipt, restoring once', async () => {
        const record = (await (await createReturn(3)).json()).return;
        const responses = await Promise.all([0,1].map(() => decideReturn(req({ action: 'REJECTED' }),params(record.id))));
        expect(responses.map(r => r.status)).toEqual([200,200]);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(14);
        const body = { action: 'RESTORE', returnId: record.id, note: 'Received and inspected', confirmedPresentAndSaleable: true };
        expect((await Promise.all([0, 1].map(() => custodyReturn(req(body), params(f.order.id))))).map(r => r.status)).toEqual([200, 200]);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(20);
    });
    it('accepts once, settles both invoices/payable and leaves warehouse stock in quarantine', async () => {
        const record = await accepted(3);
        expect((await decideReturn(req({ action: 'ACCEPTED' }),params(record.id))).status).toBe(200);
        expect((await db.warehouseInvoice.findUniqueOrThrow({ where: { id: f.invoice.id } })).total).toBe(700);
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).total).toBe(700);
        expect((await db.supplier.findUniqueOrThrow({ where: { id: f.supplier.id } })).balance).toBe(700);
        expect((await db.warehouseBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(100);
        expect(record.items[0].disposition).toBe('QUARANTINE');
    });
    it('rechecks old inconsistent pending quantities when accepting and rolls back', async () => {
        const record = (await (await createReturn(6)).json()).return;
        await db.warehouseReturn.create({ data: { warehouseId: f.warehouse.id, orderId: f.order.id, organizationId: f.org.id, status: 'ACCEPTED', totalAmount: 500,
            items: { create: { drugId: f.drug.id, barcode: f.drug.barcode, quantity: 5, unitPrice: 100 } } } });
        expect((await decideReturn(req({action:'ACCEPTED'}),params(record.id))).status).toBe(409);
        expect((await db.warehouseInvoice.findUniqueOrThrow({where:{id:f.invoice.id}})).total).toBe(1000);
    });
    it('requires an original matching batch and records inspected restock once', async () => {
        const record = await accepted(3);
        const other = await db.warehouseBatch.create({ data: { catalogItemId: f.catalog.id, quantity: 5, batchNumber: 'WRONG', expiryDate: new Date('2031-01-01') } });
        const body = { itemId: record.items[0].id, action: 'RELEASED', note: 'Checked sealed storage', allocations: [{ batchId: other.id, quantity: 3 }] };
        expect((await inspectReturn(req(body),params(record.id))).status).toBe(409);
        body.allocations[0].batchId=f.batch.id;
        const responses=await Promise.all([0,1].map(()=>inspectReturn(req(body),params(record.id))));
        expect(responses.map(r=>r.status)).toEqual([200,200]);
        expect((await db.warehouseBatch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(103);
        expect(await db.warehouseStockMove.count({where:{orderId:f.order.id,type:'RETURN'}})).toBe(1);
    });
    it('blocks cancellation after receipt even without a warehouse invoice', async () => {
        state.tenant.userPermissions = getDefaultPermissions('ADMIN');
        await db.warehouseOrder.update({where:{id:f.order.id},data:{status:'APPROVED'}});
        await db.warehouseInvoice.delete({where:{id:f.invoice.id}});
        const response = await changeOrder(req({action:'CANCELLED'}),params(f.order.id));
        expect(response.status).toBe(409);
        expect((await db.warehouseOrder.findUniqueOrThrow({where:{id:f.order.id}})).status).toBe('APPROVED');
        expect((await db.purchase.findUniqueOrThrow({where:{id:f.purchase.id}})).status).toBe('COMPLETED');
    });
    it('reports receipt linkage after returns using received quantities, not the remaining stock', async () => {
        await accepted(3);
        const linked = await reconciliationData(req({}), params(f.order.id));
        expect(linked.status).toBe(200);
        expect((await linked.json()).receiptLinked).toBe(true);
        await db.batch.update({where:{id:f.pharmacyBatch.id},data:{purchaseItemId:null}});
        const missing = await reconciliationData(req({}), params(f.order.id));
        expect((await missing.json()).receiptLinked).toBe(false);
    });
    it('assigns a stable sequential credit note only after acceptance', async () => {
        const pending = (await (await createReturn(1)).json()).return;
        expect(pending.creditNoteNumber).toBeNull();
        const first = (await (await decideReturn(req({action:'ACCEPTED'}), params(pending.id))).json()).return;
        expect(first.creditNoteNumber).toMatch(/^WCN-\d{4,}$/);
        const replay = (await (await decideReturn(req({action:'ACCEPTED'}), params(pending.id))).json()).return;
        expect(replay.creditNoteNumber).toBe(first.creditNoteNumber);
    });
    it('bulk inspection rolls back every item if a later item fails and replays safely', async () => {
        const record = await accepted(3);
        const extra = await db.warehouseReturnItem.create({data:{returnId:record.id,drugId:f.drug.id,barcode:f.drug.barcode,quantity:1,unitPrice:100,pharmacyAllocations:[{batchId:f.pharmacyBatch.id,quantity:2}]}});
        const body = {action:'RELEASED',note:'Checked sealed storage',items:[
            {itemId:record.items[0].id,allocations:[{batchId:f.batch.id,quantity:3}]},
            {itemId:extra.id,allocations:[{batchId:'missing',quantity:1}]}
        ]};
        expect((await inspectReturn(req(body),params(record.id))).status).toBe(409);
        expect((await db.warehouseBatch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(100);
        expect((await db.warehouseReturnItem.findUniqueOrThrow({where:{id:record.items[0].id}})).disposition).toBe('QUARANTINE');
        body.items[1].allocations[0].batchId=f.batch.id;
        expect((await inspectReturn(req(body),params(record.id))).status).toBe(200);
        expect((await inspectReturn(req(body),params(record.id))).status).toBe(200);
        expect((await db.warehouseBatch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(104);
    });
    it('paid return creates credit and concurrent cash refund does not pay twice', async () => {
        await db.warehouseInvoice.update({where:{id:f.invoice.id},data:{paidAmount:1000,status:'PAID'}});
        await db.purchase.update({where:{id:f.purchase.id},data:{paidAmount:1000}});
        await db.supplier.update({where:{id:f.supplier.id},data:{balance:0}});
        const record=await accepted(3); expect(record.creditBalance).toBe(300);
        const body={idempotencyKey:randomUUID(),amount:300,reference:'CASH-TEST'};
        expect((await Promise.all([0,1].map(()=>refundReturn(req(body),params(record.id))))).map(r=>r.status)).toEqual([200,200]);
        expect((await db.warehouseInvoice.findUniqueOrThrow({where:{id:f.invoice.id}})).paidAmount).toBe(700);
        expect((await db.purchase.findUniqueOrThrow({where:{id:f.purchase.id}})).paidAmount).toBe(700);
        expect((await db.supplier.findUniqueOrThrow({where:{id:f.supplier.id}})).balance).toBe(0);
        expect((await refundReturn(req({...body,idempotencyKey:randomUUID()}),params(record.id))).status).toBe(409);
    });
    it('replays supplier payment and rejects changed payload under the same key',async()=>{
        const body={idempotencyKey:randomUUID(),amount:300};
        expect((await Promise.all([0,1].map(()=>paySupplier(req(body),params(f.payable.id))))).map(r=>r.status)).toEqual([201,201]);
        expect((await db.warehousePurchase.findUniqueOrThrow({where:{id:f.payable.id}})).paidAmount).toBe(300);
        expect(await db.warehouseSupplierPayment.count({where:{purchaseId:f.payable.id}})).toBe(1);
        expect((await paySupplier(req({...body,amount:200}),params(f.payable.id))).status).toBe(409);
    });
    it('archives catalog without deleting its batches or stock ledger',async()=>{
        expect((await archive(new NextRequest(`http://localhost/api/catalog?id=${f.catalog.id}`,{method:'DELETE'}))).status).toBe(200);
        expect((await db.warehouseCatalogItem.findUniqueOrThrow({where:{id:f.catalog.id}})).isAvailable).toBe(false);
        expect(await db.warehouseBatch.count({where:{id:f.batch.id}})).toBe(1);
        expect(await db.warehouseStockMove.count({where:{catalogItemId:f.catalog.id}})).toBe(1);
    });
    it('replays rep van loading without moving stock twice',async()=>{
        const body={idempotencyKey:randomUUID(),batchId:f.batch.id,quantity:5};
        const responses=await Promise.all([0,1].map(()=>load(req(body),params(f.rep.id))));
        expect(responses.every(r=>r.ok)).toBe(true);
        expect((await db.warehouseBatch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(95);
        expect((await db.warehouseRepStock.findUniqueOrThrow({where:{repId_batchId:{repId:f.rep.id,batchId:f.batch.id}}})).quantity).toBe(15);
    });
    it('denies price import for inventory staff without side effects',async()=>{
        await db.user.update({where:{id:f.owner.id},data:{warehouseUserType:'INVENTORY'}});
        const response=await importCatalog(req({rows:[{barcode:f.drug.barcode,price:999}]}));
        expect((await response.json()).failed).toBe(1);
        expect((await db.warehouseCatalogItem.findUniqueOrThrow({where:{id:f.catalog.id}})).price).toBe(100);
    });
    it('rejects a stale absolute stock count',async()=>{
        const response=await adjust(req({batchId:f.batch.id,newQuantity:120,expectedQuantity:110,reason:'stock count'}));
        expect(response.status).toBe(409);
        expect((await db.warehouseBatch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(100);
    });
    it('enforces blocked/credit terms in field sales and replays successful sales',async()=>{
        const customer=await db.warehouseCustomer.create({data:{warehouseId:f.warehouse.id,organizationId:f.org.id,isBlocked:true}});
        const body={idempotencyKey:randomUUID(),organizationId:f.org.id,customerName:'Test pharmacy',lines:[{batchId:f.batch.id,quantity:2,unitPrice:100}]};
        expect((await sell(req(body),params(f.rep.id))).status).toBe(403);
        await db.warehouseCustomer.update({where:{id:customer.id},data:{isBlocked:false,creditLimit:1100}});
        expect((await sell(req(body),params(f.rep.id))).status).toBe(409);
        await db.warehouseCustomer.update({where:{id:customer.id},data:{creditLimit:0}});
        const response=await sell(req(body),params(f.rep.id)); expect(response.status).toBe(201);
        expect((await sell(req(body),params(f.rep.id))).status).toBe(200);
        expect(await db.warehouseFieldSale.count({where:{warehouseId:f.warehouse.id}})).toBe(1);
        const sale=(await response.json()).fieldSale;
        const payment={idempotencyKey:randomUUID(),fieldSaleId:sale.id,amount:100};
        expect((await Promise.all([0,1].map(()=>collect(req(payment),params(f.rep.id))))).map(r=>r.status)).toEqual([201,201]);
        expect((await db.warehouseFieldSale.findUniqueOrThrow({where:{id:sale.id}})).paidAmount).toBe(100);
        await collect(req({idempotencyKey:randomUUID(),amount:100}),params(f.rep.id));
        const performance=await getRepPerformance(f.warehouse.id,{from:new Date('2020-01-01'),to:new Date('2035-01-01')});
        expect(performance[0].collectedTotal).toBe(100); // Cash handover is not a second customer collection/commission.
    });
    it('serializes two different sales against the shared customer credit limit',async()=>{
        await db.warehouseCustomer.create({data:{warehouseId:f.warehouse.id,organizationId:f.org.id,creditLimit:1300}});
        const responses=await Promise.all([0,1].map(()=>sell(req({idempotencyKey:randomUUID(),organizationId:f.org.id,customerName:'Test',lines:[{batchId:f.batch.id,quantity:2,unitPrice:100}]}),params(f.rep.id))));
        expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
    });
    it('summary includes opening balance and field sales; reports preserve historic cost and Baghdad day',async()=>{
        await db.warehouseCustomer.create({data:{warehouseId:f.warehouse.id,organizationId:f.org.id,openingBalance:200}});
        await sell(req({idempotencyKey:randomUUID(),organizationId:f.org.id,customerName:'Test',lines:[{batchId:f.batch.id,quantity:2,unitPrice:100}]}),params(f.rep.id));
        expect(summarizeReceivables(await loadOpenReceivables(db,f.warehouse.id),new Date()).outstanding).toBe(1400);
        await db.warehouseCatalogItem.update({where:{id:f.catalog.id},data:{costPrice:999}});
        const lines=await getSoldLines(f.warehouse.id,{from:new Date('2020-01-01'),to:new Date('2035-01-01')});
        expect(lines.find(l=>l.orderId===f.order.id)?.costTotal).toBe(400);
        expect(lines.reduce((n,l)=>n+l.lineTotal,0)).toBe(1200);
        const base={barcode:'x',tradeName:'x',quantity:1,lineTotal:100,organizationId:f.org.id,shippedAt:'2026-09-20T22:00:00Z'};
        expect(salesByPeriod([{...base,orderId:'1'},{...base,orderId:'2'}],'day')[0]).toMatchObject({key:'2026-09-21',orders:2});
    });
    it('server searches beyond first invoice/purchase page and masks stock cost',async()=>{
        await db.warehousePurchase.createMany({data:Array.from({length:55},(_,i)=>({warehouseId:f.warehouse.id,supplierId:f.payable.supplierId,invoiceNumber:`PAGE-${i}`,total:1}))});
        const all=await purchases(new NextRequest('http://localhost/api/purchases?page=2'));
        const data=await all.json(); expect(data.total).toBe(56); expect(data.purchases).toHaveLength(6);
        const search=await purchases(new NextRequest('http://localhost/api/purchases?search=PAGE-54')); expect((await search.json()).purchases).toHaveLength(1);
        expect((await (await invoices(new NextRequest(`http://localhost/api/invoices?search=${f.invoice.invoiceNumber}`))).json()).invoices).toHaveLength(1);
        expect((await loadWarehouseStock(f.warehouse.id,false)).items[0]).toMatchObject({costPrice:null,batches:[expect.objectContaining({costPrice:null})]});
    });
    it('stock filtering and totals cover records beyond the old 500-row cap',async()=>{
        const drugs=Array.from({length:505},(_,i)=>({id:randomUUID(),barcode:`${f.warehouse.id}-${i}`,tradeName:`Item ${String(i).padStart(4,'0')}`,scientificName:'Test',alternatives:[]}));
        await db.globalDrug.createMany({data:drugs});
        await db.warehouseCatalogItem.createMany({data:drugs.map(d=>({warehouseId:f.warehouse.id,drugId:d.id,barcode:d.barcode,price:1,minStock:1}))});
        const first=await loadWarehouseStock(f.warehouse.id,false,'','low');
        expect(first.total).toBe(505); expect(first.items).toHaveLength(50);
        expect((await loadWarehouseStock(f.warehouse.id,false,'Item 0504','low')).items).toHaveLength(1);
        expect((await loadWarehouseStock(f.warehouse.id,false,'','low',11)).items).toHaveLength(5);
        expect((await loadWarehouseStock(f.warehouse.id,false,'','out')).total).toBe(0); // untracked is not empty tracked stock
    });
    it('reports never truncate the 5001st shipped order',async()=>{
        const orders=Array.from({length:5001},()=>({id:randomUUID(),warehouseId:f.warehouse.id,branchId:f.branch.id,status:'SHIPPED' as const,totalAmount:1}));
        await db.warehouseOrder.createMany({data:orders});
        await db.warehouseOrderItem.createMany({data:orders.map(o=>({warehouseOrderId:o.id,drugId:f.drug.id,quantity:1,unitPrice:1,status:'AVAILABLE' as const}))});
        await db.warehouseOrderEvent.createMany({data:orders.map(o=>({orderId:o.id,actorType:'WAREHOUSE',type:'SHIPPED'}))});
        const lines=await getSoldLines(f.warehouse.id,{from:new Date('2020-01-01'),to:new Date('2035-01-01')});
        expect(lines).toHaveLength(5002);
        expect(lines.reduce((sum,l)=>sum+l.lineTotal,0)).toBe(6001);
    });
    it('masks credit/payment balances from sales staff and denies their cash refund',async()=>{
        const record=await accepted(1);
        await db.user.update({where:{id:f.owner.id},data:{warehouseUserType:'SALES'}});
        const listed=await (await listReturns(new NextRequest('http://localhost/api/returns'))).json();
        expect(listed.returns[0]).toMatchObject({creditBalance:null,refundedAmount:null});
        const replay=await (await decideReturn(req({action:'ACCEPTED'}),params(record.id))).json();
        expect(replay.return.creditBalance).toBeNull();
        expect((await refundReturn(req({idempotencyKey:randomUUID(),amount:1,reference:'TEST'}),params(record.id))).status).toBe(403);
    });
});


describe('remaining warehouse gaps regression', () => {
    async function rejected() {
        const record = (await (await createReturn(3)).json()).return;
        expect((await custodyReturn(req({ action: 'DISPATCH', returnId: record.id, note: 'Dispatch receipt 001' }), params(f.order.id))).status).toBe(200);
        await decideReturn(req({ action: 'REJECTED' }), params(record.id));
        return record;
    }
    async function opening() { return db.warehouseCustomer.create({ data: { warehouseId: f.warehouse.id, organizationId: f.org.id, openingBalance: 200 } }); }
    async function proposal() {
        const response = await proposeMatch(req({ idempotencyKey: randomUUID(), reference: 'PAY-001', note: 'Verified original receipt' }), params(f.invoice.id));
        expect(await response.clone().json()).not.toHaveProperty('error'); expect(response.status).toBe(200);
        return (await response.json()).proposalId;
    }
    function confirm(proposalId: string) { return { idempotencyKey: randomUUID(), action: 'CONFIRM_PAYMENT', proposalId, reference: 'PAY-001', note: 'Pharmacy verified receipt', confirmed: true, pharmacyPaymentSource: 'UNRECORDED' }; }
    async function legacy() {
        await db.purchase.update({ where: { id: f.purchase.id }, data: { warehouseOrderId: null } });
        await db.warehouseOrderItem.updateMany({ where: { warehouseOrderId: f.order.id }, data: { unitsPerPack: null } });
        await db.batch.update({ where: { id: f.pharmacyBatch.id }, data: { purchaseItemId: null } });
        const item = await db.warehouseOrderItem.findFirstOrThrow({ where: { warehouseOrderId: f.order.id } });
        return { idempotencyKey: randomUUID(), action: 'LINK_RECEIPT', purchaseId: f.purchase.id, reference: 'RECEIPT-001', note: 'Original signed receiving record', confirmed: true,
            lines: [{ orderItemId: item.id, purchaseItemId: f.purchase.items[0].id, unitsPerPack: 2, batchIds: [f.pharmacyBatch.id] }] };
    }
    it('never restores shipped rejected stock without pharmacy confirmation', async () => {
        const record = await rejected();
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(14);
        expect((await custodyReturn(req({ action: 'RESTORE', returnId: record.id, note: 'not yet received' }), params(f.order.id))).status).toBe(409);
        const listed = await pharmacyReturns(req({}), params(f.order.id));
        expect((await listed.json()).returns[0]).toMatchObject({ restored: false, dispatched: true });
    });
    it('rejects cross-tenant custody and non-manager custody', async () => {
        const record = await rejected();
        const body = { action: 'RESTORE', returnId: record.id, note: 'Received safely', confirmedPresentAndSaleable: true };
        state.tenant.organizationId = randomUUID();
        expect((await custodyReturn(req(body), params(f.order.id))).status).toBe(404);
        state.tenant.organizationId = f.org.id; state.tenant.user.role = 'PHARMACIST';
        expect((await custodyReturn(req(body), params(f.order.id))).status).toBe(403);
    });
    it('does not restore expired goods even with confirmation', async () => {
        const record = await rejected();
        await db.batch.update({ where: { id: f.pharmacyBatch.id }, data: { expiryDate: new Date('2020-01-01') } });
        expect((await custodyReturn(req({ action: 'RESTORE', returnId: record.id, note: 'Received safely', confirmedPresentAndSaleable: true }), params(f.order.id))).status).toBe(409);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(14);
    });
    it('does not restore a legacy rejection twice after deployment', async () => {
        const record = await rejected();
        await db.warehouseOrderEvent.create({ data: { orderId: f.order.id, type: 'RETURN_REJECTED', actorType: 'WAREHOUSE', payload: { returnId: record.id, stockDisposition: 'RESTORED_TO_PHARMACY' } } });
        const response = await custodyReturn(req({ action: 'RESTORE', returnId: record.id, note: 'Received safely', confirmedPresentAndSaleable: true }), params(f.order.id));
        expect((await response.json()).replayed).toBe(true);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(14);
    });
    it('rejects free-text field sales when organization is omitted', async () => {
        await db.warehouseCustomer.create({ data: { warehouseId: f.warehouse.id, organizationId: f.org.id, isBlocked: true } });
        for (const organizationId of [undefined, null, '']) {
            const response = await sell(req({ idempotencyKey: randomUUID(), organizationId, customerName: 'Same blocked pharmacy', lines: [{ batchId: f.batch.id, quantity: 2, unitPrice: 100 }] }), params(f.rep.id));
            expect(response.status).toBe(400);
        }
        expect(await db.warehouseFieldSale.count({ where: { warehouseId: f.warehouse.id } })).toBe(0);
    });
    it('records partial and full opening payments with immutable before/after history', async () => {
        const customer = await opening();
        const body = { idempotencyKey: randomUUID(), kind: 'OPENING_PAYMENT', customerId: customer.id, amount: 50, reference: 'OPEN-001' };
        expect((await Promise.all([settleOpening(req(body)), settleOpening(req(body))])).map(r => r.status)).toEqual([200, 200]);
        expect((await settleOpening(req({ ...body, idempotencyKey: randomUUID() }))).status).toBe(409);
        expect((await settleOpening(req({ ...body, idempotencyKey: randomUUID(), amount: 150, reference: 'OPEN-002' }))).status).toBe(200);
        expect((await db.warehouseCustomer.findUniqueOrThrow({ where: { id: customer.id } })).openingBalance).toBe(0);
        const entries = await db.warehouseSettlement.findMany({ where: { warehouseId: f.warehouse.id }, orderBy: { createdAt: 'asc' } });
        expect(entries.map(e => e.details)).toEqual([expect.objectContaining({ before: 200, after: 150 }), expect.objectContaining({ before: 150, after: 0 })]);
        expect((await customerTerms(req({ openingBalance: 500 }), params(customer.id))).status).toBe(409);
    });
    it('serializes overpayment attempts against opening debt', async () => {
        const customer = await opening();
        const responses = await Promise.all([0, 1].map(i => settleOpening(req({ idempotencyKey: randomUUID(), kind: 'OPENING_PAYMENT', customerId: customer.id, amount: 150, reference: `OPEN-${i}` }))));
        expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
        expect((await db.warehouseCustomer.findUniqueOrThrow({ where: { id: customer.id } })).openingBalance).toBe(50);
    });
    it('isolates opening payments and the voucher ledger by warehouse', async () => {
        const customer = await opening();
        const other = await db.warehouse.create({ data: { name: randomUUID() } });
        await db.warehouseCustomer.update({ where: { id: customer.id }, data: { warehouseId: other.id } });
        expect((await settleOpening(req({ idempotencyKey: randomUUID(), kind: 'OPENING_PAYMENT', customerId: customer.id, amount: 10, reference: 'OPEN-001' }))).status).toBe(404);
        await db.warehouseSettlement.create({ data: { warehouseId: other.id, kind: 'OPENING_PAYMENT', reference: 'OTHER', sourceId: customer.id, amount: 10, direction: 'IN', actorId: f.owner.id, details: {} } });
        expect((await (await settlements(new NextRequest('http://localhost/api/settlements'))).json()).total).toBe(0);
    });
    it('denies nonfinancial staff opening payments and proposals', async () => {
        const customer = await opening();
        await db.user.update({ where: { id: f.owner.id }, data: { warehouseUserType: 'SALES' } });
        expect((await settleOpening(req({ idempotencyKey: randomUUID(), kind: 'OPENING_PAYMENT', customerId: customer.id, amount: 10, reference: 'OPEN-001' }))).status).toBe(403);
        expect((await proposeMatch(req({ idempotencyKey: randomUUID(), reference: 'PAY-001', note: 'A documented payment' }), params(f.invoice.id))).status).toBe(403);
    });
    it('requires both parties before matching and then permits partial and full refund', async () => {
        await db.warehouseInvoice.update({ where: { id: f.invoice.id }, data: { paidAmount: 1000, status: 'PAID' } });
        const record = await accepted(3);
        const id = await proposal();
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).paidAmount).toBe(0);
        const body = confirm(id);
        expect((await Promise.all([reconcile(req(body), params(f.order.id)), reconcile(req(body), params(f.order.id))])).map(r => r.status)).toEqual([200, 200]);
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).paidAmount).toBe(1000);
        for (const [amount, reference] of [[100, 'REF-001'], [200, 'REF-002']] as const) {
            const response = await refundReturn(req({ idempotencyKey: randomUUID(), amount, reference }), params(record.id));
            expect(await response.clone().json()).not.toHaveProperty('error'); expect(response.status).toBe(200);
        }
        expect((await db.warehouseInvoice.findUniqueOrThrow({ where: { id: f.invoice.id } })).paidAmount).toBe(700);
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).paidAmount).toBe(700);
        expect(await db.warehouseSettlement.count({ where: { warehouseId: f.warehouse.id, kind: 'RETURN_REFUND' } })).toBe(2);
        const reversed = await db.supplierPayment.aggregate({ where: { supplierId: f.supplier.id, method: 'REFUND' }, _sum: { amount: true } });
        expect(reversed._sum.amount).toBe(-300);
    });
    it('allocates refundable credit when pharmacy payments are reconciled after acceptance', async () => {
        await db.purchase.update({ where: { id: f.purchase.id }, data: { paidAmount: 1000 } });
        const record = await accepted(3); expect(record.creditBalance).toBe(0);
        const body = confirm(await proposal());
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(200);
        expect((await db.warehouseReturn.findUniqueOrThrow({ where: { id: record.id } })).creditBalance).toBe(300);
        expect((await refundReturn(req({ idempotencyKey: randomUUID(), amount: 300, reference: 'REF-001' }), params(record.id))).status).toBe(200);
    });
    it('allocates an existing supplier receipt without reducing supplier balance twice', async () => {
        await db.warehouseInvoice.update({ where: { id: f.invoice.id }, data: { paidAmount: 1000, status: 'PAID' } });
        const payment = await db.supplierPayment.create({ data: { supplierId: f.supplier.id, branchId: f.branch.id, amount: 1000, reference: 'PAY-001' } });
        await db.supplier.update({ where: { id: f.supplier.id }, data: { balance: 0 } });
        const body = { ...confirm(await proposal()), pharmacyPaymentSource: 'EXISTING', supplierPaymentId: payment.id };
        const response = await reconcile(req(body), params(f.order.id));
        expect(await response.clone().json()).not.toHaveProperty('error'); expect(response.status).toBe(200);
        expect((await db.supplier.findUniqueOrThrow({ where: { id: f.supplier.id } })).balance).toBe(0);
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).paidAmount).toBe(1000);
        expect(await db.supplierPayment.count({ where: { supplierId: f.supplier.id } })).toBe(1);
    });
    it('requires choosing the existing supplier receipt when its reference exists', async () => {
        await db.warehouseInvoice.update({ where: { id: f.invoice.id }, data: { paidAmount: 1000, status: 'PAID' } });
        await db.supplierPayment.create({ data: { supplierId: f.supplier.id, branchId: f.branch.id, amount: 1000, reference: 'PAY-001' } });
        const body = confirm(await proposal());
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(409);
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).paidAmount).toBe(0);
    });
    it('rejects a stale reconciliation snapshot without touching balances', async () => {
        const body = confirm(await proposal());
        await db.purchase.update({ where: { id: f.purchase.id }, data: { paidAmount: 100 } });
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(409);
        expect(await db.warehouseSettlement.count({ where: { warehouseId: f.warehouse.id } })).toBe(0);
    });
    it('prevents a reused refund reference even with a fresh operation key', async () => {
        await db.purchase.update({ where: { id: f.purchase.id }, data: { paidAmount: 1000 } });
        await db.warehouseInvoice.update({ where: { id: f.invoice.id }, data: { paidAmount: 1000, status: 'PAID' } });
        const record = await accepted(3);
        for (const status of [200, 409]) expect((await refundReturn(req({ idempotencyKey: randomUUID(), amount: 100, reference: 'REF-001' }), params(record.id))).status).toBe(status);
        expect((await db.warehouseReturn.findUniqueOrThrow({ where: { id: record.id } })).refundedAmount).toBe(100);
    });
    it('links a documented legacy receipt, preserves quantities, and allows returns', async () => {
        const body = await legacy();
        expect((await createReturn(1)).status).toBe(409);
        const response = await reconcile(req(body), params(f.order.id));
        expect(await response.clone().json()).not.toHaveProperty('error'); expect(response.status).toBe(200);
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(200);
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).quantity).toBe(20);
        expect((await createReturn(1)).status).toBe(201);
    });
    it('rejects wrong conversion and preserves unlinked state transactionally', async () => {
        const body = await legacy(); body.lines[0].unitsPerPack = 3;
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(409);
        expect((await db.purchase.findUniqueOrThrow({ where: { id: f.purchase.id } })).warehouseOrderId).toBeNull();
        expect((await db.batch.findUniqueOrThrow({ where: { id: f.pharmacyBatch.id } })).purchaseItemId).toBeNull();
    });
    it('rejects a batch from a different branch and a duplicated batch selection', async () => {
        const body = await legacy(); body.lines[0].batchIds.push(f.pharmacyBatch.id);
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(409);
        body.lines[0].batchIds.pop(); body.idempotencyKey = randomUUID();
        const other = await db.branch.create({ data: { name: 'Other', organizationId: f.org.id } });
        const inventory = await db.inventory.create({ data: { branchId: other.id, drugId: f.drug.id, price: 60, cost: 50 } });
        await db.batch.update({ where: { id: f.pharmacyBatch.id }, data: { inventoryId: inventory.id } });
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(409);
    });
    it('denies legacy reconciliation across organizations and to pharmacists', async () => {
        const body = await legacy(); state.tenant.organizationId = randomUUID();
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(404);
        expect((await reconciliationData(req({}), params(f.order.id))).status).toBe(404);
        state.tenant.organizationId = f.org.id; state.tenant.user.role = 'PHARMACIST';
        expect((await reconcile(req(body), params(f.order.id))).status).toBe(403);
    });
});
