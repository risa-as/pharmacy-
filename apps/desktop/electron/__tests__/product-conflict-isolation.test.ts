import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import * as validation from '../product-snapshot-validation';
import * as maps from '../product-sync-maps';
import * as diff from '../product-sync-diff';

// Execute the real pull function, including its cleanup phase. Network and
// storage are controlled; no customer database or Electron instance is opened.
async function run(localConflictId = 'a', collisionOnly = false) {
 const localDrugs:any[]=[{id:localConflictId,barcode:'duplicate',isActive:true},{id:'safe',barcode:'safe',isActive:true}];
 const inventories:any[]=[{id:'old-inv',drugId:localConflictId,branchId:'branch',quantity:8},{id:'safe-inv',drugId:'safe',branchId:'branch',quantity:37}];
 const batches:any[]=[{id:'old-batch',inventoryId:'old-inv',quantity:8},{id:'safe-batch',inventoryId:'safe-inv',quantity:37}];
 const matches=(row:any,where:any={})=>Object.entries(where).every(([key,value]:any)=> value?.in ? value.in.includes(row[key]) : row[key]===value);
 const model=(rows:any[])=>({
  findMany:vi.fn(async({where}:any={})=>rows.filter(row=>matches(row,where)).map(row=>({...row}))),
  update:vi.fn(async({where,data}:any)=>{const row=rows.find(r=>r.id===where.id);Object.assign(row,data);return {...row};}),
  updateMany:vi.fn(async()=>({count:0})),
  deleteMany:vi.fn(async({where}:any)=>{for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],where))rows.splice(i,1);}),
 });
 const tx={globalDrug:model(localDrugs),inventory:model(inventories),batch:model(batches)};
 const drugs=[{id:'a',inventoryId:'cloud-a',barcode:'duplicate'},...(!collisionOnly?[{id:'b',inventoryId:'cloud-b',barcode:'duplicate'}]:[]),
  {id:'safe',inventoryId:'safe-inv',barcode:'safe',stock:31,batches:[{id:'safe-batch',batchNumber:'safe',quantity:31,expiryDate:'2028-01-01',costPrice:15}]}];
 const source=readFileSync(new URL('../sync.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function syncProductsExclusive()');
 const end=source.indexOf('\n}',start)+2;
 const helpers=source.slice(source.indexOf('const SQLITE_VAR_LIMIT'),source.indexOf('// Debug log file'));
 const code=ts.transpileModule(helpers+'\n'+source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const deps:any={...validation,...maps,...diff,beginSyncTask:()=>true,endSyncTask:()=>{},checkConnection:async()=>true,getBranchId:()=> 'branch',getApiBaseUrl:()=> 'isolated',getDeviceAuthHeaders:()=>({}),fetchProductSyncSnapshotWithCache:async()=>({snapshot:{drugs}}),prisma:{$transaction:async(fn:any)=>fn(tx)},recordSyncSuccess:vi.fn(),console:{log:vi.fn(),warn:vi.fn(),error:vi.fn()}};
 const result=await new Function(...Object.keys(deps),code+';return syncProductsExclusive();')(...Object.values(deps));
 return {result,inventories,batches,tx};
}
it('updates an unrelated stock from 37 to 31 and preserves the conflicting stock and batches',async()=>{
 const x=await run();
 expect(x.result).toMatchObject({success:false,count:1});
 expect(x.result.reason).toContain('duplicate');
 expect(x.inventories.find(r=>r.id==='safe-inv').quantity).toBe(31);
 expect(x.batches.find(r=>r.id==='safe-batch').quantity).toBe(31);
 expect(x.inventories.find(r=>r.id==='old-inv').quantity).toBe(8);
 expect(x.batches.find(r=>r.id==='old-batch').quantity).toBe(8);
});
it('preserves an older local identity even when neither cloud identity matches it',async()=>{
 const x=await run('legacy');
 expect(x.inventories.some(r=>r.drugId==='legacy')).toBe(true);
 expect(x.batches.some(r=>r.id==='old-batch')).toBe(true);
});
it('never deletes a local barcode identity to replace it with a single different cloud identity',async()=>{
 const x=await run('legacy',true);
 expect(x.inventories.some(r=>r.drugId==='legacy')).toBe(true);
 expect(x.batches.some(r=>r.id==='old-batch')).toBe(true);
 expect(x.result.success).toBe(false);
});
