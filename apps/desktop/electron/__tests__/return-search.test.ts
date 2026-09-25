import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { saleIdPrefix } from '../sale-ref';

function setup(matches: any[], revoked = false) {
    const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const start = source.indexOf('ipcMain.handle("search-sale",');
    const end = source.indexOf('ipcMain.handle("search-sales-by-drug",', start);
    if (start < 0 || end < 0) throw Error('Search handler not found');
    const code = ts.transpileModule(source.slice(start, end), {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
    let handler: any;
    const findMany = vi.fn(async (_args: any) => matches);
    const authorize = vi.fn(async () => ({who:{branch:'own-branch'},assertCurrent(){if(revoked)throw Error('session changed');}}));
    new Function('ipcMain','prisma','authorizeOperations','saleIdPrefix',code)(
        {handle:(_:string,fn:any)=>{handler=fn;}},{sale:{findMany}},authorize,saleIdPrefix,
    );
    return {handler,findMany,authorize};
}
it('returns both official and old printed number matches, scoped to the employee branch', async () => {
    const matches=[{id:'official'},{id:'printed'}];
    const h=setup(matches);
    expect(await h.handler(null,'٢٣٥٠')).toEqual({success:true,sales:matches});
    expect(h.authorize).toHaveBeenCalledWith('canViewSales');
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({where:{user:{branchId:'own-branch'},OR:expect.arrayContaining([{invoiceNumber:'2350'},{printedReference:'2350'}])}});
});
it('discards results if the employee session changed during the search', async () => {
    expect(await setup([{id:'sale'}],true).handler(null,'2350')).toEqual({success:false,error:'session changed'});
});
