import { beforeEach, expect, it, vi } from 'vitest';
// No real Prisma client, credentials, HTTP service or production data is used.
const h = vi.hoisted(() => ({ db: {} as any, tenant: vi.fn() }));
vi.mock('@/app/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: h.tenant }));
import { POST } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  h.tenant.mockResolvedValue({user:{id:'employee-a',branchId:'branch-a',role:'PHARMACIST'},userPermissions:{canProcessReturn:true}});
  Object.assign(h.db, {
    sale: { findUnique: vi.fn().mockResolvedValue({id:'sale-a',branchId:'branch-a',safeId:'safe-a',total:300,items:[{drugId:'drug-a',quantity:3,price:100,batchAllocations:JSON.stringify([{batchId:'sold-batch',quantity:3}])}],returns:[],payment:{method:'CASH'}}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    syncActionLog: {findUnique:vi.fn().mockResolvedValue(null),create:vi.fn()},
    saleReturn:{findMany:vi.fn().mockResolvedValue([]),create:vi.fn(async ({data}:any)=>({id:'return-a',...data,items:data.items.create}))},
    safe:{findFirst:vi.fn().mockResolvedValue({id:"safe-a"}),update:vi.fn().mockResolvedValue({})},
    transaction:{create:vi.fn().mockResolvedValue({})},
    inventory:{findFirst:vi.fn().mockResolvedValue({id:'inventory-a',batches:[{id:'latest-batch',quantity:8}]})},
    batch:{findMany:vi.fn().mockResolvedValue([{id:'sold-batch'}]),update:vi.fn().mockResolvedValue({}),create:vi.fn().mockResolvedValue({})},
    $transaction:vi.fn(async (fn:any)=>fn(h.db)),
  });
});
const submit=(extra={})=>POST(new Request('http://audit.invalid/api/sales/sale-a/return',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:[{drugId:'drug-a',quantity:1}],...extra})}),{params:Promise.resolve({id:'sale-a'})});


it('rejects a foreign refund safe without writing money or return',async()=>{
 h.db.safe.findFirst.mockResolvedValue(null);
 expect((await submit({safeId:'foreign-safe'})).status).toBe(400);
 expect(h.db.safe.update).not.toHaveBeenCalled();expect(h.db.saleReturn.create).not.toHaveBeenCalled();
});
it('restores stock using an atomic increment',async()=>{
 expect((await submit()).status).toBe(200);
 expect(h.db.batch.update).toHaveBeenCalledWith({where:{id:'sold-batch'},data:{quantity:{increment:1}}});
});
it('quarantines rather than inventing a replacement batch or expiry date',async()=>{
 h.db.batch.findMany.mockResolvedValue([]);
 expect((await submit()).status).toBe(200);
 expect(h.db.batch.update).not.toHaveBeenCalled();
 expect(h.db.saleReturn.create.mock.calls[0][0].data.items.create[0].stockStatus).toBe('QUARANTINED');
 expect(h.db.batch.create).not.toHaveBeenCalled();
});
