import { getDefaultPermissions } from '../app/lib/permissions';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ tenant: null as any, warehouse: null as any, session: null as any, db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.tenant }));
vi.mock('@/app/lib/warehouse-context', () => ({ getWarehouseContext: async () => state.warehouse }));
vi.mock('@/auth', () => ({auth: async () => state.session}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ notifyWarehouseUsers: vi.fn(), notifyBranchUsers: vi.fn(), sendAndPersistNotification: vi.fn() }));
import { POST as createOrder } from '../app/api/warehouses/orders/route';
import { POST as decide } from '../app/api/warehouses/orders/[id]/route';
import { PATCH as quote } from '../app/api/warehouse-portal/orders/[id]/quote/route';
import { POST as link } from '../app/api/admin/warehouses/[id]/supplier-links/route';
import { POST as compare } from '../app/api/purchases/supplier-prices/route';
import { GET as search } from '../app/api/purchases/drug-search/route';
import { loadPriceRecords, loadPairHistory } from '../app/lib/supplier-price-history';
import { receivePurchaseStock } from '../app/lib/purchase-receipt';
import { buildSendGroups, restoreSendGroups, executeSendAttempt } from '../app/lib/warehouse-order-grouping';
const db = new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});
state.db = db;
let f: any;
const req = (body: unknown) => new NextRequest('http://localhost/api/test', {method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
const scope = () => ({organizationId:f.org.id,branchIds:[f.branch.id]});
const expiry = () => new Date(Date.now()+365*86400000);
beforeEach(async () => {
 const key=randomUUID();
 const org=await db.organization.create({data:{name:key}});
 const branch=await db.branch.create({data:{name:'Branch',organizationId:org.id}});
 const warehouse=await db.warehouse.create({data:{name:key,operatingMode:'FULL'}});
 const owner=await db.user.create({data:{email:key+'@test.invalid',password:'unused',role:'WAREHOUSE',warehouseId:warehouse.id,warehouseUserType:'OWNER'}});
 const supplier=await db.supplier.create({data:{name:'Supplier',organizationId:org.id}});
 const drug=await db.globalDrug.create({data:{barcode:key,tradeName:'Drug '+key,scientificName:'Test 100mg',alternatives:[],unitsPerPack:1,unitsPerPackConfirmedAt:new Date()}});
 const local=await db.globalDrug.create({data:{barcode:key,tradeName:drug.tradeName,scientificName:drug.scientificName,organizationId:org.id,alternatives:[]}});
 f={org,branch,warehouse,owner,supplier,drug,local};
 state.tenant={organizationId:org.id,user:{id:owner.id,role:'ADMIN',branchId:branch.id},userPermissions:getDefaultPermissions('ADMIN')};
 state.warehouse={warehouseId:warehouse.id,user:{id:owner.id,role:'WAREHOUSE'}};
 state.session={user:{id:owner.id,role:'SUPER_ADMIN',name:'Test admin'}};
});
afterAll(()=>db.$disconnect());
async function batch(drugId: string, price: number, date: string, branchId=f.branch.id) {
 const inv=await db.inventory.upsert({where:{drugId_branchId:{drugId,branchId}},create:{drugId,branchId,price:1000,cost:price},update:{}});
 return db.batch.create({data:{inventoryId:inv.id,quantity:2,initialQuantity:2,batchNumber:randomUUID(),expiryDate:expiry(),costPrice:price,supplierId:f.supplier.id,createdAt:new Date(date)}});
}
describe('need-list data and lifecycle on isolated PostgreSQL',()=>{
 it('combines local/global history, skips bonus and gates unverified units',async()=>{
   await batch(f.local.id,800,'2026-08-01'); await batch(f.drug.id,900,'2026-09-01'); await batch(f.drug.id,0,'2026-09-02');
   const unverified=await (await compare(req({drugIds:[f.local.id]}))).json();
   expect(unverified.comparisons[f.local.id].cheapest).toBeNull();
   expect(unverified.comparisons[f.local.id].options[0]).toMatchObject({price:900,qualityReason:'UNVERIFIED_UNIT'});
   const verified=await (await compare(req({drugIds:[f.local.id,f.drug.id],verifiedUnitDrugIds:[f.local.id,f.drug.id]}))).json();
   expect(verified.comparisons[f.local.id].cheapest.price).toBe(900);
   expect(verified.comparisons[f.drug.id].cheapest.price).toBe(900);
   expect((await loadPairHistory(scope(),f.local.id,f.supplier.id)).batches).toHaveLength(3);
 });
 it('a zero-only batch does not suppress the paid completed-invoice fallback',async()=>{
   await batch(f.local.id,0,'2026-09-02');
   await db.purchase.create({data:{branchId:f.branch.id,supplierId:f.supplier.id,status:'COMPLETED',total:750,items:{create:{drugId:f.drug.id,quantity:1,cost:750}}}});
   const records=await loadPriceRecords(scope(),[f.local.id]);
   expect(records.get(f.local.id)).toHaveLength(1);
   expect(records.get(f.local.id)![0]).toMatchObject({source:'COMPLETED_PURCHASE',price:750});
 });
 it('search returns one canonical item and only the allowed branch stock',async()=>{
   await batch(f.local.id,100,'2026-08-01');
   const other=await db.branch.create({data:{name:'Other',organizationId:f.org.id}});
   await batch(f.drug.id,1,'2026-09-01',other.id);
   const response=await search(new NextRequest('http://localhost/api/purchases/drug-search?query='+f.drug.barcode));
   const data=await response.json();
   expect(data.items).toHaveLength(1);
   expect(data.items[0]).toMatchObject({globalDrugId:f.drug.id,currentStock:2});
   const prices=await loadPriceRecords(scope(),[f.drug.id]);
   expect(prices.get(f.drug.id)!.map(r=>r.price)).toEqual([100]);
 });
 it('foreign ids never expose prices or histories',async()=>{
   await batch(f.drug.id,100,'2026-09-01');
   const org=await db.organization.create({data:{name:randomUUID()}});
   const branch=await db.branch.create({data:{name:'Foreign',organizationId:org.id}});
   expect((await loadPriceRecords({organizationId:org.id,branchIds:[branch.id]},[f.local.id])).get(f.local.id)).toEqual([]);
   expect((await loadPairHistory({organizationId:org.id,branchIds:[branch.id]},f.drug.id,f.supplier.id)).batches).toEqual([]);
 });
 it('links an existing supplier, recovers a lost response, quotes and receives once',async()=>{
   const props={params:Promise.resolve({id:f.warehouse.id})};
   expect((await link(req({organizationId:f.org.id,supplierId:f.supplier.id}),props)).status).toBe(200);
   expect((await link(req({organizationId:f.org.id,supplierId:f.supplier.id}),props)).status).toBe(200);
   expect(await db.auditLog.count({where:{entityId:f.supplier.id,action:'LINK'}})).toBe(1);
   const [group]=buildSendGroups([{drugId:f.local.id,barcode:f.drug.barcode,quantity:2,warehouseId:f.warehouse.id,warehouseName:'W',supplierName:'S',unitPrice:100}],randomUUID);
   let durable: any;
   const save=(g:any)=>{durable=JSON.parse(JSON.stringify(g));};
   await executeSendAttempt(group,f.branch.id,'original',save,async body=>{
     expect(durable.status).toBe('SENDING');
     expect((await createOrder(req(body))).status).toBe(201);
     throw new Error('lost response after commit');
   });
   const [restored]=restoreSendGroups([durable],f.branch.id);
   const replay=await executeSendAttempt(restored,f.branch.id,'changed',save,async body=>{
     const response=await createOrder(req(body)); return {status:response.status,data:await response.json()};
   });
   expect(replay.status).toBe('SENT');
   expect(await db.warehouseOrder.count({where:{idempotencyKey:group.idempotencyKey}})).toBe(1);
   const order=await db.warehouseOrder.findUniqueOrThrow({where:{idempotencyKey:group.idempotencyKey},include:{items:true}});
   expect(order.notes).toBe('original');
   expect((await quote(req({items:[{itemId:order.items[0].id,status:'AVAILABLE',quotedPrice:120,bonusQuantity:1}]}),{params:Promise.resolve({id:order.id})})).status).toBe(200);
   const approved=await decide(req({action:'APPROVED'}),{params:{id:order.id}});
   expect(approved.status).toBe(200);
   const approval=await approved.json();
   const purchase=await db.purchase.findUniqueOrThrow({where:{id:approval.purchaseId},include:{items:true}});
   expect(purchase.supplierId).toBe(f.supplier.id);
   expect(purchase.total).toBe(240);
   await db.warehouseOrder.update({ where: { id: purchase.warehouseOrderId! }, data: { status: 'DELIVERED' } });
   await receivePurchaseStock(db,purchase.id,{branchId:f.branch.id},purchase.items.map(i=>({itemId:i.id,quantity:i.quantity,expiryDate:expiry(),batchNumber:randomUUID()})));
   const prices=await (await compare(req({drugIds:[f.local.id],verifiedUnitDrugIds:[f.local.id]}))).json();
   expect(prices.comparisons[f.local.id].cheapest.price).toBe(120);
   expect(await db.supplier.count({where:{organizationId:f.org.id}})).toBe(1);
 });
 it('partial success retries only the rejected warehouse after recovery',async()=>{
   const other=await db.warehouse.create({data:{name:randomUUID(),isActive:false}});
   const groups=buildSendGroups([f.warehouse,other].map(w=>({drugId:f.drug.id,barcode:f.drug.barcode,quantity:1,warehouseId:w.id,warehouseName:w.name,supplierName:null,unitPrice:100})),randomUUID);
   const saved=groups.slice();
   const transport=async(body:any)=>{const r=await createOrder(req(body));return {status:r.status,data:await r.json()};};
   for(let i=0;i<groups.length;i++) saved[i]=await executeSendAttempt(groups[i],f.branch.id,null,g=>{saved[i]=g;},transport);
   expect(saved.map(g=>g.status)).toEqual(['SENT','FAILED']);
   await db.warehouse.update({where:{id:other.id},data:{isActive:true}});
   const recovered=restoreSendGroups(JSON.parse(JSON.stringify(saved)),f.branch.id);
   for(let i=0;i<recovered.length;i++) await executeSendAttempt(recovered[i],f.branch.id,null,()=>{},transport);
   expect(await db.warehouseOrder.count({where:{branchId:f.branch.id}})).toBe(2);
   expect(await db.warehouseOrder.count({where:{idempotencyKey:groups[0].idempotencyKey}})).toBe(1);
 });
 it('rejects duplicate canonical items and ambiguous global barcodes',async()=>{
   const body={warehouseId:f.warehouse.id,idempotencyKey:randomUUID(),items:[{barcode:f.drug.barcode,quantity:1},{drugId:f.drug.id,quantity:1}]};
   expect((await createOrder(req(body))).status).toBe(400);
   await db.globalDrug.create({data:{barcode:f.drug.barcode,tradeName:'Different',scientificName:'Different',alternatives:[]}});
   expect((await createOrder(req({...body,idempotencyKey:randomUUID(),items:[body.items[0]]}))).status).toBe(400);
   const data=await (await search(new NextRequest('http://localhost/api/purchases/drug-search?query='+f.drug.barcode))).json();
   expect(data.items.every((i:any)=>i.globalDrugId===null)).toBe(true);
 });
 it('rejects linking from a non-superadmin and cross-organization supplier',async()=>{
   const props={params:Promise.resolve({id:f.warehouse.id})};
   state.session.user.role='ADMIN';
   expect((await link(req({organizationId:f.org.id,supplierId:f.supplier.id}),props)).status).toBe(403);
   state.session.user.role='SUPER_ADMIN';
   const other=await db.organization.create({data:{name:randomUUID()}});
   expect((await link(req({organizationId:other.id,supplierId:f.supplier.id}),props)).status).toBe(400);
   expect((await db.supplier.findUniqueOrThrow({where:{id:f.supplier.id}})).warehouseId).toBeNull();
 });
});
