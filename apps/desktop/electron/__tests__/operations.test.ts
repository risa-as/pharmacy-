import {beforeEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({handlers:new Map<string,any>(),store:new Map<string,any>()}));
vi.mock('electron',()=>({ipcMain:{handle:(name:string,fn:any)=>h.handlers.set(name,fn)}}));
vi.mock('../store',()=>({default:{get:(key:string)=>h.store.get(key)}}));
vi.mock('../api-config',()=>({getApiBaseUrl:()=> 'https://example.test/api'}));
import {registerOperations} from '../operations';
let prepare:any,refresh:any;
const response=(data:any,ok=true)=>({ok,json:async()=>data});
const access={token:'private-token',permissions:{canDoStocktake:true,canViewSuppliers:true,canCreatePurchase:true,canViewWarehouseOrders:true,canReceivePurchase:true,canReturnWarehouseOrder:true},features:{warehouseManagement:true}};
beforeEach(()=>{
 h.handlers.clear();h.store=new Map(Object.entries({loggedInUserId:'u',syncUserId:'u',syncToken:'signed',branchId:'b',syncOrgId:'org',syncUserRole:'ADMIN'}));
 prepare=vi.fn().mockResolvedValue(undefined);refresh=vi.fn().mockResolvedValue({success:true});registerOperations(prepare,refresh);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>String(url).endsWith('/session')?response(access):String(url).includes('/purchases/p?')?response({branchId:'b',warehouseOrderId:'o'}):String(url).endsWith('/purchases/p')?response({branchId:'b',warehouseOrderId:'o'}):response({success:true})));
});
const call=(input:any)=>h.handlers.get('operations:request')(null,input);
it('does not expose the bearer token to renderer',async()=>{const result=await h.handlers.get('operations:access')();expect(result.success).toBe(true);expect(result.token).toBeUndefined();});
it('rejects use of a different employees cached sync credentials',async()=>{h.store.set('loggedInUserId','other');expect((await call({path:'/purchases'})).success).toBe(false);expect(fetch).not.toHaveBeenCalled();});
it('overrides renderer branch and reports cloud success separately from local pull failure',async()=>{
 refresh.mockResolvedValue({success:false});
 const result=await call({path:'/purchases/p/receive',method:'POST',body:{branchId:'foreign',items:[]}});
 expect(result.success).toBe(true);expect(result.warning).toBeTruthy();expect(prepare).toHaveBeenCalledOnce();
 const write=(fetch as any).mock.calls.find((c:any[])=>String(c[0]).includes('/receive'));
 expect(new URL(String(write[0])).searchParams.get('branchId')).toBe('b');expect(JSON.parse(write[1].body).branchId).toBe('b');
});
it('does not write when synchronization fails',async()=>{prepare.mockRejectedValue(Error('pending'));expect((await call({path:'/purchases/p/receive',method:'POST'})).success).toBe(false);expect((fetch as any).mock.calls.some((c:any[])=>String(c[0]).includes('/receive'))).toBe(false);});
it('does not write after the active user changes during preparation',async()=>{prepare.mockImplementation(async()=>h.store.set('loggedInUserId','other'));expect((await call({path:'/purchases/p/receive',method:'POST'})).success).toBe(false);expect((fetch as any).mock.calls.some((c:any[])=>String(c[0]).includes('/receive'))).toBe(false);});
it('does not retry an uncertain receipt submission',async()=>{
 const normal=fetch;vi.stubGlobal('fetch',vi.fn(async(url:any,opts:any)=>{if(String(url).includes('/receive'))throw Error('network lost');return normal(url,opts);}));
 expect((await call({path:'/purchases/p/receive',method:'POST'})).success).toBe(false);
 expect((fetch as any).mock.calls.filter((c:any[])=>String(c[0]).includes('/receive'))).toHaveLength(1);
});

it('rejects manager review actions from the employee stocktake bridge',async()=>{
 const result=await call({path:'/inventory/stocktake/s',method:'PUT',body:{action:'APPROVE'}});
 expect(result.success).toBe(false);expect(prepare).not.toHaveBeenCalled();
});
it('denies transfers without the current permission and feature',async()=>{
 expect((await call({path:'/inventory/transfers',method:'POST',body:{}})).success).toBe(false);
 expect(prepare).not.toHaveBeenCalled();
});
it('forces transfer source to device branch and refreshes stock after sending',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).endsWith('/session')?response({...access,permissions:{...access.permissions,canTransferStock:true},features:{...access.features,interBranchTransfers:true}}):response({transfer:{id:'t'}})));
 expect((await call({path:'/inventory/transfers',method:'POST',body:{fromBranchId:'foreign',toBranchId:'destination',idempotencyKey:'key',items:[]}})).success).toBe(true);
 const write=(fetch as any).mock.calls.find((c:any[])=>String(c[0]).includes('/inventory/transfers'));
 expect(JSON.parse(write[1].body)).toMatchObject({fromBranchId:'b',branchId:'b',toBranchId:'destination',idempotencyKey:'key'});
 expect(refresh).toHaveBeenCalledOnce();
});
it('does not accept a transfer intended for another branch',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).endsWith('/session')?response({...access,permissions:{...access.permissions,canTransferStock:true},features:{...access.features,interBranchTransfers:true}}):response({transfers:[{id:'t',toBranchId:'foreign'}]})));
 expect((await call({path:'/inventory/transfers/t/receive',method:'PUT'})).success).toBe(false);
 expect(prepare).not.toHaveBeenCalled();
});
it('does not reserve a warehouse return from a different device branch',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).endsWith('/session')?response(access):response({order:{branchId:'foreign'}})));
 expect((await call({path:'/warehouses/orders/o/returns',method:'POST',body:{items:[]}})).success).toBe(false);
 expect(prepare).not.toHaveBeenCalled();
});
it('allows a transfer-only employee to search batches',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).endsWith('/session')?response({...access,permissions:{canTransferStock:true},features:{interBranchTransfers:true}}):response({items:[]})));
 expect((await call({path:'/inventory/operation-batches?search=x'})).success).toBe(true);
});
it('refreshes stock after reserving a warehouse return',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).endsWith('/session')?response(access):String(url).endsWith('/orders/o')?response({order:{branchId:'b'}}):response({id:'return'})));
 expect((await call({path:'/warehouses/orders/o/returns',method:'POST',body:{idempotencyKey:'persistent-key',items:[]}})).success).toBe(true);
 expect(refresh).toHaveBeenCalledOnce();
});
