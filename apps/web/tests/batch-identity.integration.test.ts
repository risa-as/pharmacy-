import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: vi.fn() }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ sendAndPersistNotification: vi.fn() }));
import { POST as add } from '../app/api/inventory/add-batch/route';
import { POST as sell } from '../app/api/sync/sales/route';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
const req = (body: any) => new Request('http://localhost/api/inventory/add-batch', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': body.clientActionId }, body: JSON.stringify(body) });
const payload = () => ({ inventoryId: f.inv.id, batchId: randomUUID(), clientActionId: randomUUID(), quantity: 5, costPrice: 10, batchNumber: randomUUID(), expiryDate: '2031-01-01T00:00:00.000Z' });
beforeAll(async () => {
 const org = await db.organization.create({ data: { name: 'batch identity isolated' } });
 const branch = await db.branch.create({ data: { name: 'isolated', organizationId: org.id } });
 const admin = await db.user.create({ data: { email: randomUUID()+'@test.invalid', password:'unused', role:'ADMIN', branchId:branch.id } });
 const drug = await db.globalDrug.create({data:{barcode:randomUUID(),tradeName:'isolated',scientificName:'isolated',alternatives:[]}});
 const inv = await db.inventory.create({data:{branchId:branch.id,drugId:drug.id,price:20,cost:10}});
 f={branch,admin,drug,inv};state.session={user:{id:admin.id}};
});
afterAll(()=>db.$disconnect());
it('keeps the local batch identity; a sale before the first pull and retries deduct once',async()=>{
 const b=payload();expect((await add(req(b))).status).toBe(200);
 expect((await (await add(req(b))).json()).batchId).toBe(b.batchId);
 const sale={id:randomUUID(),userId:f.admin.id,total:20,discount:0,paymentMethod:'CASH',createdAt:new Date().toISOString(),items:[{drugId:f.drug.id,quantity:1,price:20,batchAllocations:JSON.stringify([{batchId:b.batchId,quantity:1}])}]};
 const send=()=>sell(new Request('http://localhost/api/sync/sales',{method:'POST',body:JSON.stringify({branchId:f.branch.id,sales:[sale]})}));
 expect((await (await send()).json()).syncedIds).toContain(sale.id);
 expect((await (await send()).json()).syncedIds).toContain(sale.id);
 expect((await add(req(b))).status).toBe(200);
 expect((await db.batch.findUniqueOrThrow({where:{id:b.batchId}})).quantity).toBe(4);
});
it('serializes concurrent retries',async()=>{
 const b=payload();const responses=await Promise.all([add(req(b)),add(req(b))]);expect(responses.map(r=>r.status)).toEqual([200,200]);
 expect(await db.batch.count({where:{id:b.batchId}})).toBe(1);
});
it('rejects a reused identity with a new operation key without resetting stock',async()=>{
 const b=payload();await add(req(b));expect((await add(req({...b,clientActionId:randomUUID()}))).status).toBe(409);
 expect((await db.batch.findUniqueOrThrow({where:{id:b.batchId}})).quantity).toBe(5);
});
it('rejects a changed payload or identity under the same key',async()=>{
 const b=payload();await add(req(b));for(const patch of [{quantity:9},{batchId:randomUUID()}])expect((await add(req({...b,...patch}))).status).toBe(409);
});
it('keeps old clients compatible and does not repeat their stock-in',async()=>{
 const {batchId,...b}=payload();await add(req(b));expect((await add(req(b))).status).toBe(200);expect(await db.batch.count({where:{batchNumber:b.batchNumber}})).toBe(1);
});
it('rejects an invalid id or missing durable operation key',async()=>{
 const b=payload();for(const patch of [{batchId:'bad'},{clientActionId:''}])expect((await add(req({...b,...patch}))).status).toBe(400);
});

it('rejects another branch inventory and another branch operation key',async()=>{
 const org=await db.organization.create({data:{name:'foreign isolated'}});
 const branch=await db.branch.create({data:{name:'foreign',organizationId:org.id}});
 const inv=await db.inventory.create({data:{branchId:branch.id,drugId:f.drug.id,price:20,cost:10}});
 const b=payload();expect((await add(req({...b,inventoryId:inv.id}))).status).toBe(403);
 await db.syncActionLog.create({data:{idempotencyKey:b.clientActionId,branchId:branch.id,actionType:'ADD_BATCH'}});
 expect((await add(req(b))).status).toBe(403);expect(await db.batch.count({where:{id:b.batchId}})).toBe(0);
});
