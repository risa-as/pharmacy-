import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const h = vi.hoisted(() => ({ db: null as any, tenant: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return h.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => h.tenant }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/lib/sync-auth', async (importActual) => ({
  // Real operator-permission check (reads the DB row); only the identity is stubbed.
  ...(await importActual<typeof import('../app/lib/sync-auth')>()),
  validateSyncUser: async () => ({ ...h.tenant.user, organizationId: h.tenant.organizationId }),
}));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: async () => 'Test' }));
import { POST as syncRefund } from '../app/api/sync/returns/route';
import { POST as syncSale } from '../app/api/sync/sales/route';
import { POST as sell } from '../app/api/sales/route';
import { POST as reviewStock } from '../app/api/returns/items/[id]/review/route';
import { POST as refund } from '../app/api/sales/[id]/return/route';
const url = process.env.TEST_DATABASE_URL!;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/faramace_readiness') throw new Error('Isolated test DB required');
const db = new PrismaClient({ datasources: { db: { url } } });
h.db = db;
let f: any;
beforeEach(async () => {
  const key = randomUUID();
  const org = await db.organization.create({ data: { name: 'Audit ' + key } });
  const branch = await db.branch.create({ data: { name: 'Audit', organizationId: org.id } });
  const user = await db.user.create({ data: { email: key+'@test.invalid', password: 'synthetic', role: 'ADMIN', branchId: branch.id } });
  const drug = await db.globalDrug.create({ data: { barcode: key, tradeName: 'Audit drug', scientificName: 'Audit', alternatives: [] } });
  const inv = await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 100, cost: 70 } });
  const batch = await db.batch.create({ data: { inventoryId: inv.id, batchNumber: key, expiryDate: new Date('2030-01-01'), quantity: 5, initialQuantity: 5, costPrice: 70 } });
  const safe = await db.safe.create({ data: { name: 'Audit cash', branchId: branch.id } });
  h.tenant = { user, organizationId: org.id, userPermissions: { canSell: true, canProcessReturn: true, canApplyDiscount: true } };
  h.tenant.user.role = 'ADMIN'; h.tenant.tenantBranchWhere = { branchId: branch.id }; h.tenant.userPermissions.canDoStocktake = true;
  f = { branch, drug, batch, safe, inv };
});
afterAll(() => db.$disconnect());
const request = (body: any) => new Request('http://test.invalid', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
const saleRequest = (quantity: number) => request({ items: [{ drugId: f.drug.id, quantity, price: 100 }], totalAmount: quantity*100 });
it('serializes competing stock deductions and never commits an oversale', async () => {
  const results = await Promise.all([sell(saleRequest(4)),sell(saleRequest(4))]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(1);
  expect(await db.sale.count({where:{branchId:f.branch.id}})).toBe(1);
  expect((await db.safe.findUniqueOrThrow({where:{id:f.safe.id}})).balance).toBe(400);
});
it('rolls back all stock when a request exceeds availability', async () => {
  expect((await sell(saleRequest(6))).status).toBe(409);
  expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(5);
  expect(await db.sale.count({where:{branchId:f.branch.id}})).toBe(0);
});
it('does not sell expired stock', async () => {
  await db.batch.update({where:{id:f.batch.id},data:{expiryDate:new Date('2020-01-01')}});
  expect((await sell(saleRequest(1))).status).toBe(409);
  expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(5);
});
it('rejects a refund to another branch without changing either safe', async () => {
  const sale = (await (await sell(saleRequest(1))).json()).sale;
  const foreignBranch = await db.branch.create({data:{name:'Other branch',organizationId:h.tenant.organizationId}});
  const foreign = await db.safe.create({data:{name:'Foreign',branchId:foreignBranch.id,balance:800}});
  const response = await refund(request({items:[{drugId:f.drug.id,quantity:1}],safeId:foreign.id}),{params:Promise.resolve({id:sale.id})});
  expect(response.status).toBe(400);
  expect(await db.saleReturn.count({where:{saleId:sale.id}})).toBe(0);
  expect((await db.safe.findUniqueOrThrow({where:{id:foreign.id}})).balance).toBe(800);
  expect((await db.safe.findUniqueOrThrow({where:{id:f.safe.id}})).balance).toBe(100);
});
it('quarantines a refund if no batch remains instead of inventing expiry', async () => {
  const sale = (await (await sell(saleRequest(1))).json()).sale;
  await db.batch.delete({where:{id:f.batch.id}});
  expect((await refund(request({items:[{drugId:f.drug.id,quantity:1}]}),{params:Promise.resolve({id:sale.id})})).status).toBe(200);
  expect(await db.saleReturn.count({where:{saleId:sale.id}})).toBe(1);
  expect((await db.safe.findUniqueOrThrow({where:{id:f.safe.id}})).balance).toBe(0);
});

it('refunds net of discount and restores original lot instead of newest expiry', async () => {
  const sale = (await (await sell(request({ items:[{drugId:f.drug.id,quantity:3,price:100}], totalAmount:250, discount:50 }))).json()).sale;
  const other = await db.batch.create({ data:{inventoryId:f.inv.id,batchNumber:'OTHER',expiryDate:new Date('2035-01-01'),quantity:20,costPrice:90} });
  const totals=[];
  for(let n=0;n<3;n++) { const response=await refund(request({items:[{drugId:f.drug.id,quantity:1}]}),{params:Promise.resolve({id:sale.id})}); expect(response.status).toBe(200); totals.push((await response.json()).saleReturn.total); }
  expect(totals).toEqual([83.33,83.34,83.33]);
  expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(5);
  expect((await db.batch.findUniqueOrThrow({where:{id:other.id}})).quantity).toBe(20);
  expect((await db.safe.findUniqueOrThrow({where:{id:f.safe.id}})).balance).toBeCloseTo(0);
});
it('keeps legacy returns segregated and allows one documented stock approval only', async () => {
  const sale = (await (await sell(saleRequest(1))).json()).sale;
  await db.saleItem.updateMany({where:{saleId:sale.id},data:{batchAllocations:null}});
  const response=await refund(request({items:[{drugId:f.drug.id,quantity:1}]}),{params:Promise.resolve({id:sale.id})});
  const item=(await response.json()).saleReturn.items[0]; expect(item.stockStatus).toBe('QUARANTINED');
  expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(4);
  const body={action:'RESTOCKED',batchId:f.batch.id,note:'Physical batch and expiry checked',confirmed:true};
  const results=await Promise.all([0,1].map(()=>reviewStock(request(body),{params:Promise.resolve({id:item.id})})));
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(5);
  expect((await db.safe.findUniqueOrThrow({where:{id:f.safe.id}})).balance).toBe(0);
});

it('desktop receives authoritative discounted return and replay without a second stock or cash update', async () => {
 const sale=(await (await sell(request({items:[{drugId:f.drug.id,quantity:2,price:100}],discount:50,totalAmount:150}))).json()).sale;
 const id=randomUUID();
 const body={branchId:f.branch.id,returns:[{id,saleId:sale.id,userId:h.tenant.user.id,total:100,createdAt:new Date().toISOString(),refundVersion:2,items:[{drugId:f.drug.id,quantity:1,price:100}]}]};
 for(let n=0;n<2;n++) { const response=await syncRefund(new NextRequest('http://test.invalid',{method:'POST',body:JSON.stringify(body)}));const result=await response.json();expect(result.syncedIds).toEqual([id]);expect(result.records[0]).toMatchObject({total:75,items:[expect.objectContaining({stockStatus:'RESTOCKED'})]}); }
 expect((await db.safe.findUniqueOrThrow({where:{id:f.safe.id}})).balance).toBe(75);
 expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(4);
});
it('disposal records cost once and cannot be used to restock again', async () => {
 const sale=(await (await sell(saleRequest(1))).json()).sale;
 await db.saleItem.updateMany({where:{saleId:sale.id},data:{batchAllocations:null}});
 const result=await (await refund(request({items:[{drugId:f.drug.id,quantity:1}]}),{params:Promise.resolve({id:sale.id})})).json();const id=result.saleReturn.items[0].id;
 const review=()=>reviewStock(request({action:'DISPOSED',confirmed:true,note:'Damaged packaging confirmed'}),{params:Promise.resolve({id})});
 expect((await review()).status).toBe(200);expect((await review()).status).toBe(409);
 expect((await db.expense.aggregate({where:{branchId:f.branch.id},_sum:{amount:true}}))._sum.amount).toBe(70);
 expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(4);
});
it('desktop sync uses the actual recorded batch and does not subtract discount twice from debt', async () => {
 const patient=await db.patient.create({data:{name:'Test',phone:randomUUID(),branchId:f.branch.id}});
 const later=await db.batch.create({data:{inventoryId:f.inv.id,batchNumber:'Actual lot',expiryDate:new Date('2031-01-01'),quantity:2,costPrice:80}});
 const id=randomUUID();
 const body={branchId:f.branch.id,sales:[{id,userId:h.tenant.user.id,total:75,discount:25,paymentMethod:'CREDIT',patientId:patient.id,patient:{id:patient.id,name:patient.name,phone:patient.phone},createdAt:new Date().toISOString(),items:[{drugId:f.drug.id,quantity:1,price:100,batchAllocations:JSON.stringify([{batchId:later.id,quantity:1}])}]}]};
 const result=await (await syncSale(new NextRequest('http://test.invalid',{method:'POST',body:JSON.stringify(body)}))).json();
 expect(result.syncedIds).toEqual([id]);expect((await db.patient.findUniqueOrThrow({where:{id:patient.id}})).balance).toBe(75);
 expect((await db.batch.findUniqueOrThrow({where:{id:f.batch.id}})).quantity).toBe(5);expect((await db.batch.findUniqueOrThrow({where:{id:later.id}})).quantity).toBe(1);
});

it('requires physical expiry for a missing lot and never creates an invented date', async () => {
 const sale=(await (await sell(saleRequest(1))).json()).sale;
 await db.batch.delete({where:{id:f.batch.id}});
 const result=await (await refund(request({items:[{drugId:f.drug.id,quantity:1}]}),{params:Promise.resolve({id:sale.id})})).json();const id=result.saleReturn.items[0].id;
 const review=(expiryDate:string)=>reviewStock(request({action:'RESTOCKED',newBatch:{batchNumber:'PHYSICAL-LOT',expiryDate},confirmed:true,note:'Lot and expiry read from actual package'}),{params:Promise.resolve({id})});
 expect((await review('2020-01-01T00:00:00.000Z')).status).toBe(409);
 expect(await db.batch.count({where:{inventoryId:f.inv.id}})).toBe(0);
 expect((await review('2030-06-01T00:00:00.000Z')).status).toBe(200);
 const batch=await db.batch.findFirstOrThrow({where:{inventoryId:f.inv.id}});expect(batch).toMatchObject({quantity:1,costPrice:70,batchNumber:'PHYSICAL-LOT'});expect(batch.expiryDate.toISOString()).toBe('2030-06-01T00:00:00.000Z');
});
