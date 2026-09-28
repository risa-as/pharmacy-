import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
const source=readFileSync(new URL('../sync.ts',import.meta.url),'utf8');
const start=source.indexOf('export async function pushAddBatchToCloud(');
const code=ts.transpileModule(source.slice(start,start+source.slice(start).search(/\n}\r?\n/)+2).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
async function run(response:any, batchId:string|undefined='local-id') {
 const fetch=vi.fn(async(..._args:any[])=>({ok:true}));
 const deps:any={checkConnection:async()=>true,buildIdempotencyKey:()=> 'stable-action',buildApiUrl:()=> 'isolated',fetchWithRetry:fetch,parseResponseBody:async()=>response,isAckSuccess:()=>true,console:{log:()=>{},error:()=>{}}};
 const fn=new Function(...Object.keys(deps),code+';return pushAddBatchToCloud;')(...Object.values(deps));
 return {fetch,result:fn({batchId,inventoryId:'i',quantity:5,batchNumber:'B',expiryDate:'2030-01-01'},{actionId:'action'})};
}
it('sends the local identity and accepts the same identity after a lost response',async()=>{
 const r=await run({batchId:'local-id',ack:{status:'duplicate'}});await expect(r.result).resolves.toBe(true);
 expect(JSON.parse(r.fetch.mock.calls[0][1].body)).toMatchObject({batchId:'local-id',clientActionId:'stable-action'});
});
it.each([{}, {batchId:'different-id'}])('keeps the queued action if the server does not confirm identity',async(body)=>{
 const r=await run(body);await expect(r.result).rejects.toThrow();
});
