import { beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({db:{} as any,tenant:vi.fn()}));
vi.mock('@/auth',()=>({auth:vi.fn()}));
vi.mock('@/app/lib/prisma',()=>({prisma:h.db}));
vi.mock('@/app/lib/tenant-utils',()=>({getTenantContext:h.tenant}));
import { POST } from './route';
beforeEach(()=>{
 vi.resetAllMocks();
 h.tenant.mockResolvedValue({user:{id:'employee-a',branchId:'branch-a'},organizationId:'org-a',userPermissions:{canSell:true,canApplyDiscount:false}});
 Object.assign(h.db,{
  $transaction:vi.fn(async(fn:any)=>fn(h.db)), $queryRaw:vi.fn().mockResolvedValue([{nextNumber:2n}]),
  inventory:{findMany:vi.fn().mockResolvedValue([{drugId:'drug-a',price:100,cost:50,batches:[{id:'batch-a',quantity:2,costPrice:50,expiryDate:new Date('2020-01-01')}]}])},
  batch:{updateMany:vi.fn().mockResolvedValue({count:1})}, safe:{findFirst:vi.fn().mockResolvedValue({id:'safe-a'}),update:vi.fn().mockResolvedValue({})},
  sale:{create:vi.fn(async({data}:any)=>({id:'sale-a',...data}))},payment:{create:vi.fn().mockResolvedValue({})},transaction:{create:vi.fn().mockResolvedValue({})},
  patient:{findFirst:vi.fn().mockResolvedValue(null),update:vi.fn().mockResolvedValue({})},
  // The sale is stamped with the organisation's loyalty rate (0 when the programme is off).
  branch:{findUnique:vi.fn().mockResolvedValue({organization:{loyaltyEnabled:false,loyaltyPointsPerDinar:0.01}})},
 });
});
const submit=(body:any)=>POST(new Request('http://audit.invalid/api/sales',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));

it('rejects a negative client total without starting a transaction',async()=>{
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100}],totalAmount:-500})).status).toBe(400);
 expect(h.db.$transaction).not.toHaveBeenCalled();
});
it('rejects an inconsistent positive total',async()=>{
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100}],totalAmount:1})).status).toBe(400);
});
it('rejects a patient outside the branch before any financial write',async()=>{
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100}],totalAmount:100,paymentMethod:'CREDIT',patientId:'foreign'})).status).toBe(409);
 expect(h.db.patient.update).not.toHaveBeenCalled();expect(h.db.sale.create).not.toHaveBeenCalled();
});
it('rejects insufficient stock',async()=>{
 expect((await submit({items:[{drugId:'drug-a',quantity:20,price:100}],totalAmount:2000})).status).toBe(409);
 expect(h.db.sale.create).not.toHaveBeenCalled();
});
it('uses expiry restriction and a conditional atomic deduction',async()=>{
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100}],totalAmount:100})).status).toBe(200);
 expect(h.db.inventory.findMany.mock.calls[0][0].include.batches.where.expiryDate.gt).toBeInstanceOf(Date);
 expect(h.db.batch.updateMany.mock.calls[0][0].where.quantity).toEqual({gte:1});
});
it('rejects a concurrent stock change without creating a sale',async()=>{
 h.db.batch.updateMany.mockResolvedValue({count:0});
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100}],totalAmount:100})).status).toBe(409);
 expect(h.db.sale.create).not.toHaveBeenCalled();
});
it('rejects duplicate item lines and invalid quantities',async()=>{
 for(const quantity of [0,-1,0.5]) expect((await submit({items:[{drugId:'drug-a',quantity,price:100}],totalAmount:100})).status).toBe(400);
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100},{drugId:'drug-a',quantity:1,price:100}],totalAmount:200})).status).toBe(400);
 expect(h.db.$transaction).not.toHaveBeenCalled();
});
it('accepts the mobile checkout null originalPrice without fabricating a zero price override',async()=>{
 expect((await submit({items:[{drugId:'drug-a',quantity:1,price:100,originalPrice:null}],totalAmount:100,patientId:null})).status).toBe(200);
 expect(h.db.sale.create.mock.calls[0][0].data.hasPriceOverride).toBe(false);
});
