import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
const state=vi.hoisted(()=>({context:null as any,db:null as any}));
vi.mock('@/app/lib/prisma',()=>({get prisma(){return state.db;}}));
vi.mock('@/app/lib/warehouse-context',()=>({getWarehouseContext:async()=>state.context}));
import { PATCH as profile } from '../app/api/warehouse-portal/profile/route';
import { GET as ledger } from '../app/api/warehouse-portal/accounts/receivables/route';
import { GET as activity } from '../app/api/warehouse-portal/accounts/activity/route';
const db=new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});state.db=db;
let f:any;
beforeEach(async()=>{
 const key=randomUUID();const org=await db.organization.create({data:{name:'Design '+key}});
 const branch=await db.branch.create({data:{name:'Branch',organizationId:org.id}});
 const warehouse=await db.warehouse.create({data:{name:'Design '+key,apiKey:'secret-must-not-be-returned'}});
 const owner=await db.user.create({data:{email:key+'@test.invalid',password:'not-for-login',role:'WAREHOUSE',warehouseId:warehouse.id,warehouseUserType:'OWNER'}});
 state.context={warehouseId:warehouse.id,user:{id:owner.id}};f={org,branch,warehouse,owner};
});
afterAll(()=>db.$disconnect());
const patch=(body:unknown)=>profile(new NextRequest('http://localhost/api/warehouse-portal/profile',{method:'PATCH',body:JSON.stringify(body)}));
describe('warehouse design data contracts',()=>{
 it('keeps noncash matching out of incoming and outgoing totals, scoped to warehouse',async()=>{
  await db.warehouseSettlement.createMany({data:[
   {warehouseId:f.warehouse.id,kind:'OPENING_PAYMENT',reference:randomUUID(),sourceId:'test',amount:100,direction:'IN',actorId:f.owner.id,details:{}},
   {warehouseId:f.warehouse.id,kind:'RETURN_REFUND',reference:randomUUID(),sourceId:'test',amount:20,direction:'OUT',actorId:f.owner.id,details:{}},
   {warehouseId:f.warehouse.id,kind:'PAYMENT_MATCH',reference:randomUUID(),sourceId:'test',amount:70,direction:'IN',actorId:f.owner.id,details:{}},
   {warehouseId:randomUUID(),kind:'OPENING_PAYMENT',reference:randomUUID(),sourceId:'test',amount:999,direction:'IN',actorId:f.owner.id,details:{}},
  ]});
  const result=await (await activity(new NextRequest('http://localhost/api/activity'))).json();
  expect(result.total).toBe(3);expect(result.received).toBe(100);expect(result.paid).toBe(20);expect(result.matched).toBe(70);
  expect((await activity(new NextRequest('http://localhost/api/activity?from=bad'))).status).toBe(400);
  await db.user.update({where:{id:f.owner.id},data:{isActive:false}});
  expect((await activity(new NextRequest('http://localhost/api/activity'))).status).toBe(403);
 });
 it('assigns unique consecutive WAI references concurrently without changing IDs',async()=>{
  const orders=await Promise.all(Array.from({length:16},()=>db.warehouseOrder.create({data:{warehouseId:f.warehouse.id,branchId:f.branch.id,status:'SENT'}})));
  expect(new Set(orders.map(o=>o.orderNumber)).size).toBe(16);
  orders.forEach(o=>expect(o.orderNumber).toMatch(/^WAI-\d{4,}$/));
  const numbers=orders.map(o=>Number(o.orderNumber!.slice(4))).sort((a,b)=>a-b);
  expect(numbers.at(-1)!-numbers[0]).toBe(15);
  expect(new Set(orders.map(o=>o.id)).size).toBe(16);
 });
 it('saves only supplied contacts, supports clearing, never exposes the API key or writes another warehouse',async()=>{
  const other=await db.warehouse.create({data:{name:'Other'}});
  const response=await patch({salesPhone:' 07701234567 ',followupPhone:'07801234567',managementPhone:'',warehouseId:other.id});
  expect(response.status).toBe(200);expect(JSON.stringify(await response.json())).not.toContain('secret-must-not');
  const saved=await db.warehouse.findUniqueOrThrow({where:{id:f.warehouse.id}});
  expect(saved.salesPhone).toBe('07701234567');expect(saved.managementPhone).toBeNull();
  expect((await db.warehouse.findUniqueOrThrow({where:{id:other.id}})).salesPhone).toBeNull();
  expect((await patch({salesPhone:''})).status).toBe(200);
  expect((await db.warehouse.findUniqueOrThrow({where:{id:f.warehouse.id}})).salesPhone).toBeNull();
 });
 it('rejects invalid contact strings and unauthorized profile writes',async()=>{
  expect((await patch({salesPhone:'javascript:bad'})).status).toBe(400);
  await db.user.update({where:{id:f.owner.id},data:{warehouseUserType:'INVENTORY'}});
  expect((await patch({salesPhone:'07701234567'})).status).toBe(403);
 });
 it('ledger totals include platform, field and opening balances and honor filters and tenant boundary',async()=>{
  await db.warehouseCustomer.create({data:{warehouseId:f.warehouse.id,organizationId:f.org.id,openingBalance:300}});
  const order=await db.warehouseOrder.create({data:{warehouseId:f.warehouse.id,branchId:f.branch.id,status:'APPROVED'}});
  await db.warehouseInvoice.create({data:{warehouseId:f.warehouse.id,organizationId:f.org.id,orderId:order.id,invoiceNumber:randomUUID(),total:500,paidAmount:100,status:'PARTIAL',dueAt:new Date('2020-01-01')}});
  const rep=await db.warehouseRep.create({data:{warehouseId:f.warehouse.id,name:'Rep'}});
  await db.warehouseFieldSale.create({data:{warehouseId:f.warehouse.id,repId:rep.id,organizationId:f.org.id,customerName:'Customer',invoiceNumber:randomUUID(),total:200,status:'UNPAID'}});
  const all=await ledger(new NextRequest('http://localhost/api/ledger'));
  const result=await all.json();expect(all.status).toBe(200);expect(result.total).toBe(3);expect(result.filteredOutstanding).toBe(900);expect(result.rows[0].source).toBe('PLATFORM');
  const overdue=await (await ledger(new NextRequest('http://localhost/api/ledger?aging=OVERDUE'))).json();expect(overdue.filteredOutstanding).toBe(400);expect(overdue.total).toBe(1);
  const field=await (await ledger(new NextRequest('http://localhost/api/ledger?source=FIELD'))).json();expect(field.filteredOutstanding).toBe(200);
  await db.user.update({where:{id:f.owner.id},data:{warehouseUserType:'INVENTORY'}});
  expect((await ledger(new NextRequest('http://localhost/api/ledger'))).status).toBe(403);
 });
});
