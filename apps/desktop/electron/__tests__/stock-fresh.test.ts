import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import {withStockGate,tryWithStockGate} from '../stock-gate';
const source=readFileSync(new URL('../sync.ts',import.meta.url),'utf8');
const start=source.indexOf('export async function syncProductsFresh()');
const code=ts.transpileModule(source.slice(start,source.indexOf('\n}',start)+2).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const fresh=(pull:()=>Promise<any>)=>new Function('withStockGate','syncProductsExclusive',code+';return syncProductsFresh();')(withStockGate,pull);
it('fetches once when idle rather than doing two complete pulls',async()=>{
 const pull=vi.fn(async()=>({success:true,count:1}));expect(await fresh(pull)).toEqual({success:true,count:1});expect(pull).toHaveBeenCalledOnce();
});
it('waits for a pre-mutation snapshot to finish, then reads a new one exactly once',async()=>{
 let release!:()=>void;let quantity=5;let local=0;
 const previous=tryWithStockGate(async()=>{const stale=quantity;await new Promise<void>(r=>release=r);local=stale;});
 quantity=6;
 const pull=vi.fn(async()=>{local=quantity;return {success:true};});
 const current=fresh(pull);expect(pull).not.toHaveBeenCalled();
 release();await previous;await current;
 expect(local).toBe(6);expect(pull).toHaveBeenCalledOnce();
});
it('releases the gate and propagates a failed fresh snapshot',async()=>{
 await expect(fresh(async()=>{throw Error('offline');})).rejects.toThrow('offline');
 expect(await tryWithStockGate(async()=>1)).toEqual({ran:true,value:1});
});
