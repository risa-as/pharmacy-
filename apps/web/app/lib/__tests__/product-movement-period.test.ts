import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const h = vi.hoisted(() => ({ db: {} as any, rows: {} as Record<string, any[]> }));
vi.mock('@/app/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => ({ organizationId:'org', tenantBranchWhere:{branchId:'own'}, branchModelWhere:{id:'own'} }) }));
vi.mock('@/app/lib/page-guards', () => ({ requireFeature: async () => null }));
vi.mock('@/app/ui/reports/branch-filter', () => ({ BranchFilter: () => null }));
vi.mock('@/app/ui/reports/date-range-filter', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: ({href,children,...props}:any) => createElement('a',{href,...props},children) }));
import Page from '../../dashboard/inventory/product-movement/page';
const models = ['saleItem','purchaseItem','saleReturnItem','transferItem','stocktakeItem'];
const doc = (when='2026-10-05T09:00:00.000Z') => ({ createdAt:new Date(when), updatedAt:new Date(when), documentNumber:'DOC', branch:{name:'Own'}, fromBranch:{name:'Own'}, toBranch:{name:'Other'} });
function line(type:string,when?:string,quantity=2) {return {drugId:'drug',quantity,difference:quantity,[type]:doc(when)};}
beforeEach(()=>{
 h.rows = {saleItem:[line('sale')],purchaseItem:[line('purchase')],saleReturnItem:[line('saleReturn')],transferItem:[line('transfer')],stocktakeItem:[line('stocktake')]};
 h.db.globalDrug={findFirst:vi.fn(async()=>({id:'drug',tradeName:'Drug',barcode:'123'})),findMany:vi.fn(async()=>[{id:'d1',tradeName:'Drug1',scientificName:'A',barcode:'1'},{id:'d2',tradeName:'Drug2',scientificName:'B',barcode:'2'}])};
 for(const model of models) h.db[model]={findMany:vi.fn(async(a:any)=>{
  const rel = a.where.sale || a.where.purchase || a.where.saleReturn || a.where.transfer || a.where.stocktake;
  const field=rel.updatedAt?'updatedAt':'createdAt';const range=rel[field];
  return h.rows[model].filter(row=>{const d=row[model==='saleItem'?'sale':model==='purchaseItem'?'purchase':model==='saleReturnItem'?'saleReturn':model==='transferItem'?'transfer':'stocktake'][field];return !range || (d>=range.gte && d<=range.lte)});
 })};
});
const page = (params:Record<string,string>={}) => Page({searchParams:Promise.resolve({drugId:'drug',...params})});
const render=async(params:Record<string,string>={})=>renderToStaticMarkup(await page(params));
function collect(node:any,predicate:(v:ReactElement<any>)=>boolean):ReactElement<any>[] {
 if(!node||typeof node!=='object')return[];
 if(Array.isArray(node))return node.flatMap(n=>collect(n,predicate));
 return [...(predicate(node)?[node]:[]),...collect(node.props?.children,predicate)];
}
it('scopes all six queries to the Baghdad day and retains branch scope; receipts use updatedAt',async()=>{
 await page({from:'2026-10-05',to:'2026-10-05',branch:'chosen'});
 const checks=[['saleItem','sale','createdAt'],['purchaseItem','purchase','createdAt'],['saleReturnItem','saleReturn','createdAt'],['transferItem','transfer','createdAt'],['transferItem','transfer','updatedAt'],['stocktakeItem','stocktake','createdAt']];
 for(const [model,relation,field] of checks){
  const a=h.db[model].findMany.mock.calls.map((c:any)=>c[0]).find((q:any)=>q.where[relation]?.[field]);
  expect(a.where[relation][field]).toEqual({gte:new Date('2026-10-04T21:00:00.000Z'),lte:new Date('2026-10-05T20:59:59.999Z')});
  expect(a.where[relation].AND).toEqual(expect.arrayContaining([expect.objectContaining(model==='transferItem'?{[field==='createdAt'?'fromBranchId':'toBranchId']:'own'}:{branchId:'own'})]));
  expect(a.take).toBeUndefined();
 }
});
it('includes first/last instant in the local day and excludes adjacent days',async()=>{
 for(const m of models)h.rows[m]=[];
 h.rows.saleItem=['2026-10-04T20:59:59.999Z','2026-10-04T21:00:00.000Z','2026-10-05T20:59:59.999Z','2026-10-05T21:00:00.000Z'].map(d=>line('sale',d));
 const html=await render({from:'2026-10-05',to:'2026-10-05'});
 expect(html).toContain('2 عملية');expect((html.match(/فاتورة #DOC/g)||[])).toHaveLength(2);
});
it('hour range filters all movement types and totals before rendering',async()=>{
 const html=await render({from:'2026-10-05',to:'2026-10-05',fromTime:'13:00',toTime:'14:00'});
 expect(html).toContain('0 عملية');expect(html).toContain('لا توجد حركات');expect(html).not.toContain('فاتورة #DOC');
});
it('supports daily hour windows across midnight as the shared report filter does',async()=>{
 for(const m of models)h.rows[m]=[];
 h.rows.saleItem=[line('sale','2026-10-04T22:00:00Z'),line('sale','2026-10-05T09:00:00Z'),line('sale','2026-10-05T19:00:00Z')];
 expect(await render({from:'2026-10-05',to:'2026-10-05',fromTime:'22:00',toTime:'02:00'})).toContain('2 عملية');
});
it('does not truncate records at 100 per type or 300 overall; pages retain period and product',async()=>{
 for(const m of models)h.rows[m]=[];
 h.rows.saleItem=Array.from({length:350},()=>line('sale',undefined,1));
 const tree=await page({from:'2026-10-05',to:'2026-10-05',branch:'own',q:'Drug',page:'4'});
 const html=renderToStaticMarkup(tree);expect(html).toContain('350 عملية');expect((html.match(/فاتورة #DOC/g)||[])).toHaveLength(50);expect(html).toContain('-350');expect(html).toContain('صفحة 4 من 4');
 const links=collect(tree,n=>typeof n.props?.hrefFor==='function');expect(links).toHaveLength(1);
 const url=new URL(links[0].props.hrefFor(2),'http://test.invalid');expect(Object.fromEntries(url.searchParams)).toMatchObject({drugId:'drug',from:'2026-10-05',to:'2026-10-05',q:'Drug',branch:'own',page:'2'});
 const hidden=collect(tree,n=>n.type==='input'&&n.props.type==='hidden');expect(hidden.map(n=>n.props.name)).toEqual(expect.arrayContaining(['from','to','branch']));
});
it('product choice and branch links preserve dates and hours',async()=>{
 const tree=await Page({searchParams:Promise.resolve({q:'Drug',branch:'own',from:'2026-10-05',to:'2026-10-05',fromTime:'09:00',toTime:'12:00'})});
 const links=collect(tree,n=>typeof n.props?.href==='string'&&n.props.href.includes('drugId='));expect(links).toHaveLength(2);
 for(const link of links){const p=new URL(link.props.href,'http://test.invalid').searchParams;expect(p.get('from')).toBe('2026-10-05');expect(p.get('fromTime')).toBe('09:00');expect(p.get('branch')).toBe('own')}
 const branch=collect(tree,n=>n.props?.baseUrl&&typeof n.props?.extraParams==='string')[0];expect(branch.props.extraParams).toContain('fromTime=09%3A00');
});
it('invalid/reversed dates do not fetch movements; no period keeps the complete ledger',async()=>{
 for(const params of [{from:'2026-02-30',to:'2026-10-05'},{from:'2026-10-06',to:'2026-10-05'},{from:'2026-10-05'},{fromTime:'25:00'}]){expect(await render(params)).toContain('اختر فترة صحيحة');}
 expect(h.db.saleItem.findMany).not.toHaveBeenCalled();
 expect(await render()).toContain('كامل السجل');expect(h.db.saleItem.findMany.mock.calls[0][0].where.sale).toEqual({branchId:'own'});
});
