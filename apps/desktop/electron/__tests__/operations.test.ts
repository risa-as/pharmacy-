import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({handlers:new Map<string,any>(),store:new Map<string,any>()}));
vi.mock('electron',()=>({ipcMain:{handle:(name:string,fn:any)=>h.handlers.set(name,fn)},net:{fetch:(input:any,init:any)=>globalThis.fetch(input,init)}}));
vi.mock('../store',()=>({default:{get:(key:string)=>h.store.get(key)}}));
vi.mock('../api-config',()=>({getApiBaseUrl:()=> 'https://example.test/api'}));
import {registerOperations} from '../operations';
let prepare:any,refresh:any,authorize:any;
const response=(data:any,ok=true)=>({ok,json:async()=>data});
const access={token:'private-token',permissions:{canDoStocktake:true,canViewSuppliers:true,canCreatePurchase:true,canViewWarehouseOrders:true,canReceivePurchase:true,canReturnWarehouseOrder:true},features:{warehouseManagement:true}};
beforeEach(()=>{
 h.handlers.clear();h.store=new Map(Object.entries({loggedInUserId:'u',syncUserId:'u',syncToken:'signed',branchId:'b',syncOrgId:'org',syncUserRole:'ADMIN'}));
 prepare=vi.fn().mockResolvedValue(undefined);refresh=vi.fn().mockResolvedValue({success:true});authorize=registerOperations(prepare,refresh);
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
it('blocks removed warehouse returns before any network request',async()=>{
 expect((await call({path:'/warehouses/orders/o/returns',method:'POST',body:{items:[]}})).success).toBe(false);
 expect(fetch).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();expect(refresh).not.toHaveBeenCalled();
});


// Policy changed by the owner (2026-10-01): a successful check may serve reads for
// 3 minutes. A revocation reaches writes at once and reads after the reuse expires.
it('shares simultaneous access verification; a revocation reaches writes at once and reads after the reuse', async () => {
 let release!: (value: any) => void;
 const pending = new Promise(resolve => { release = resolve; });
 vi.stubGlobal('fetch', vi.fn(async (url: any) => String(url).endsWith('/session') ? pending : response([])));
 const accessCall = h.handlers.get('operations:access')();
 const listCall = call({path:'/purchases'});
 expect(fetch).toHaveBeenCalledTimes(1);
 release(response(access));
 expect((await accessCall).success).toBe(true);
 expect((await listCall).success).toBe(true);
 vi.stubGlobal('fetch', vi.fn(async () => response({error:'revoked'}, false)));
 // A write verifies again and sees the revocation immediately.
 expect((await call({path:'/purchases/p/receive',method:'POST',body:{items:[]}})).success).toBe(false);
 expect(fetch).toHaveBeenCalledOnce();
 // The failed check dropped the reuse: the next read asks the server and is refused too.
 expect((await h.handlers.get('operations:access')()).success).toBe(false);
 expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not share an in-flight authorization after switching users', async () => {
 let release!: (value: any) => void;
 const pending = new Promise(resolve => { release = resolve; });
 vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending).mockResolvedValue(response(access)));
 const first = h.handlers.get('operations:access')();
 h.store.set('loggedInUserId','other'); h.store.set('syncUserId','other'); h.store.set('syncToken','other-token');
 expect((await h.handlers.get('operations:access')()).success).toBe(true);
 release(response(access));
 expect((await first).success).toBe(false);
 expect(fetch).toHaveBeenCalledTimes(2);
});

it('passes a refused receipt status and code to the renderer instead of only a message',async()=>{
 const normal=fetch;vi.stubGlobal('fetch',vi.fn(async(url:any,opts:any)=>String(url).includes('/receive')?{ok:false,status:409,json:async()=>({message:'الفاتورة ملغاة',code:'PURCHASE_CANCELLED'})}:normal(url,opts)));
 const result=await call({path:'/purchases/p/receive',method:'POST'});
 expect(result).toMatchObject({success:false,status:409,code:'PURCHASE_CANCELLED',error:'الفاتورة ملغاة'});
 expect(result.lost).toBeFalsy();
 expect(refresh).not.toHaveBeenCalled();
});
it('marks a receipt whose answer never arrived as lost, so the renderer checks the document',async()=>{
 const normal=fetch;vi.stubGlobal('fetch',vi.fn(async(url:any,opts:any)=>{if(String(url).includes('/receive'))throw Error('network lost');return normal(url,opts);}));
 expect(await call({path:'/purchases/p/receive',method:'POST'})).toMatchObject({success:false,lost:true});
});
it('does not mark a receipt refused before sending as lost',async()=>{
 prepare.mockRejectedValue(Error('pending'));
 const result=await call({path:'/purchases/p/receive',method:'POST'});
 expect(result.success).toBe(false);expect(result.lost).toBeFalsy();
});
it('pulls stock after a receipt answered with a server error, since it may have been applied',async()=>{
 const normal=fetch;vi.stubGlobal('fetch',vi.fn(async(url:any,opts:any)=>String(url).includes('/receive')?{ok:false,status:502,json:async()=>({message:'bad gateway'})}:normal(url,opts)));
 expect(await call({path:'/purchases/p/receive',method:'POST'})).toMatchObject({success:false,status:502});
 expect(refresh).toHaveBeenCalledOnce();
});

// Owner's decision (2026-10-01): a successful check may serve READS for 3 minutes; writes always re-verify.
describe('reusing a successful permission check for reads', () => {
 const sessions=()=>(fetch as any).mock.calls.filter((c:any[])=>String(c[0]).endsWith('/session')).length;
 it('two reads within 3 minutes ask the server once; a write asks again', async()=>{
  await authorize('canDoStocktake',{read:true});
  await authorize('canDoStocktake',{read:true});
  expect(sessions()).toBe(1);
  await authorize('canDoStocktake');
  expect(sessions()).toBe(2);
 });
 it('expires after 3 minutes', async()=>{
  vi.useFakeTimers({toFake:['Date']});
  try{
   vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
   await authorize('canDoStocktake',{read:true});
   vi.setSystemTime(new Date('2026-10-01T10:02:59Z'));
   await authorize('canDoStocktake',{read:true});
   expect(sessions()).toBe(1);
   vi.setSystemTime(new Date('2026-10-01T10:03:01Z'));
   await authorize('canDoStocktake',{read:true});
   expect(sessions()).toBe(2);
  } finally { vi.useRealTimers(); }
 });
 it('a change of identity or session version forces a new check', async()=>{
  await authorize('canDoStocktake',{read:true});
  h.store.set('syncSessionVersion',2);
  await authorize('canDoStocktake',{read:true});
  h.store.set('branchId','b2');
  await authorize('canDoStocktake',{read:true});
  expect(sessions()).toBe(3);
 });
 it('a failed check drops the reuse at once (revoked permission)', async()=>{
  await authorize('canDoStocktake',{read:true});
  vi.stubGlobal('fetch',vi.fn(async()=>response({error:'revoked'},false)));
  await expect(authorize('canDoStocktake')).rejects.toThrow();
  vi.stubGlobal('fetch',vi.fn(async()=>response({error:'revoked'},false)));
  await expect(authorize('canDoStocktake',{read:true})).rejects.toThrow();
 });
 it('a reused check still enforces the permission', async()=>{
  await authorize('canDoStocktake',{read:true});
  await expect(authorize('canTransferStock',{read:true})).rejects.toThrow();
 });
 it('warehouse reads (GET) reuse the check; writes (POST) verify again', async()=>{
  await call({path:'/purchases/p'});
  await call({path:'/purchases/p'});
  expect(sessions()).toBe(1);
  await call({path:'/purchases/p/receive',method:'POST',body:{items:[]}});
  expect(sessions()).toBe(2);
 });
});

describe('which requests wait for each other', () => {
 it('a plain read is never refused while another request (e.g. a write) is in flight; a second write still is', async()=>{
  let release!: () => void;
  const held = new Promise<void>(r => { release = r; });
  prepare.mockImplementation(() => held); // the write stays in its sync step
  const write = call({path:'/purchases/p/receive',method:'POST',body:{items:[]}});
  await new Promise(r => setTimeout(r, 0));
  // A list read from another page goes through at once.
  expect((await call({path:'/purchases'})).success).toBe(true);
  // A second write is still refused while the first runs.
  const second = await call({path:'/purchases/p/receive',method:'POST',body:{items:[]}});
  expect(second).toMatchObject({ success: false, error: 'انتظر اكتمال العملية الحالية' });
  release();
  expect((await write).success).toBe(true);
 });
 it('a count sheet read syncs first, so it still runs one at a time', async()=>{
  let release!: () => void;
  const held = new Promise<void>(r => { release = r; });
  prepare.mockImplementation(() => held);
  vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).endsWith('/session')?response(access):response({stocktake:{branchId:'b',items:[]},sheet:[]})));
  const sheet = call({path:'/inventory/stocktake/s1?type=sheet'});
  await new Promise(r => setTimeout(r, 0));
  expect((await call({path:'/inventory/stocktake/s2?type=sheet'})).success).toBe(false);
  release();
  expect((await sheet).success).toBe(true);
 });
});
