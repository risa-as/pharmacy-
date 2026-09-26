import {beforeEach,it,expect,vi} from 'vitest';
import {receivePurchaseStock} from '../purchase-receipt';
let tx:any,db:any;
const future='2099-01-01T00:00:00.000Z';
const line={itemId:'item',quantity:5,batchNumber:'A',expiryDate:future,cost:100};
beforeEach(()=>{
 tx={$queryRaw:vi.fn(),warehouseOrderEvent:{findFirst:vi.fn().mockResolvedValue(null)},warehouseOrder:{findUnique:vi.fn()},purchase:{findFirst:vi.fn().mockResolvedValue({id:'p',status:'PENDING',items:[{id:'item',drugId:'drug',quantity:5,cost:100}],branchId:'branch',supplierId:'supplier',supplier:{name:'Supplier'},total:500,paidAmount:0,branch:{organization:{minProfitMargin:5}}}),update:vi.fn().mockResolvedValue({id:'p',status:'COMPLETED'})},purchaseItem:{update:vi.fn()},inventory:{findMany:vi.fn().mockResolvedValue([]),upsert:vi.fn().mockResolvedValue({id:'inv'})},batch:{create:vi.fn()},supplier:{update:vi.fn()},auditLog:{create:vi.fn()},expense:{create:vi.fn()}};
 tx.branch={findUniqueOrThrow:vi.fn().mockResolvedValue({organizationId:'org'})};
 tx.globalDrug={findMany:vi.fn().mockResolvedValue([{id:'drug',barcode:'123',tradeName:'Medicine',scientificName:'Medicine',isActive:true,unitsPerPack:null}])};
 db={$transaction:vi.fn((fn:any)=>fn(tx))};
});
it('preserves each received batch and charges the invoice once',async()=>{await receivePurchaseStock(db,'p',{branchId:'branch'},[{...line,quantity:2},{...line,quantity:3,batchNumber:'B'}]);expect(tx.batch.create).toHaveBeenCalledTimes(2);expect(tx.batch.create.mock.calls.map((c:any)=>c[0].data.quantity)).toEqual([2,3]);expect(tx.supplier.update).toHaveBeenCalledWith({where:{id:'supplier'},data:{balance:{increment:500}}});});
it('rejects split quantities exceeding the invoice before mutation',async()=>{await expect(receivePurchaseStock(db,'p',{},[{...line,quantity:3},{...line,quantity:3,batchNumber:'B'}])).rejects.toThrow();expect(tx.batch.create).not.toHaveBeenCalled();});
it('rejects duplicate batch entries',async()=>{await expect(receivePurchaseStock(db,'p',{},[{...line,quantity:2},{...line,quantity:3}])).rejects.toThrow();expect(tx.batch.create).not.toHaveBeenCalled();});
it('rejects changed price on approved warehouse invoices',async()=>{tx.warehouseOrderEvent.findFirst.mockResolvedValue({orderId:'w'});tx.warehouseOrder.findUnique.mockResolvedValue({status:'SHIPPED'});await expect(receivePurchaseStock(db,'p',{},[{...line,cost:120}])).rejects.toThrow();expect(tx.batch.create).not.toHaveBeenCalled();});
it('rejects receiving before shipment',async()=>{tx.warehouseOrderEvent.findFirst.mockResolvedValue({orderId:'w'});tx.warehouseOrder.findUnique.mockResolvedValue({status:'APPROVED'});await expect(receivePurchaseStock(db,'p',{},[line])).rejects.toThrow();expect(tx.batch.create).not.toHaveBeenCalled();});
it('does not receive an invoice twice',async()=>{tx.purchase.findFirst.mockResolvedValue({status:'COMPLETED',items:[]});await expect(receivePurchaseStock(db,'p',{},[line])).rejects.toThrow();expect(tx.batch.create).not.toHaveBeenCalled();});

it('rejects a zero-priced ordinary purchase at receipt',async()=>{await expect(receivePurchaseStock(db,'p',{},[{...line,cost:0}])).rejects.toThrow();expect(tx.batch.create).not.toHaveBeenCalled();});
it('preserves a free line already approved by the warehouse',async()=>{const purchase=await tx.purchase.findFirst();purchase.items[0].cost=0;purchase.total=0;tx.warehouseOrderEvent.findFirst.mockResolvedValue({orderId:'w'});tx.warehouseOrder.findUnique.mockResolvedValue({status:'SHIPPED'});await receivePurchaseStock(db,'p',{},[{...line,cost:0}]);expect(tx.batch.create.mock.calls[0][0].data.costPrice).toBe(0);});
