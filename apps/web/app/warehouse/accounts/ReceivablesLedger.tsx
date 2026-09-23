'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, Search, RefreshCw } from 'lucide-react';
import { exportToExcel } from '@/app/lib/excel-export';
import EmptyState from '../_components/EmptyState';
import ListPages from '../_components/ListPages';
type Row={id:string;organizationId:string|null;customer:string;reference:string;source:string;remaining:number;dueAt:string|null;aging:string};
const labels:Record<string,string>={PLATFORM:'طلبات المنصة',FIELD:'بيع ميداني',OPENING:'رصيد افتتاحي'};
export default function ReceivablesLedger(){
 const [search,setSearch]=useState(''),[source,setSource]=useState('ALL'),[aging,setAging]=useState('ALL'),[page,setPage]=useState(1),[version,setVersion]=useState(0);
 const [data,setData]=useState<{rows:Row[];total:number;filteredOutstanding:number}>({rows:[],total:0,filteredOutstanding:0});
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
 const timer=setTimeout(async()=>{try{const res=await fetch('/api/warehouse-portal/accounts/receivables?'+new URLSearchParams({search,source,aging,page:String(page)}),{signal:controller.signal});const value=await res.json();if(!res.ok)throw Error(value.error);if(!controller.signal.aborted)setData(value);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'تعذر الاتصال');}finally{if(!controller.signal.aborted)setLoading(false);}},200);
 return()=>{clearTimeout(timer);controller.abort();};},[search,source,aging,page,version]);
 const selectClass='rounded-lg border bg-card px-3 py-2 text-sm';
 return <section className="space-y-3 rounded-lg border bg-card p-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">دفتر الذمم وأولوية التحصيل</h3><p className="mt-1 text-sm text-muted-foreground">جميع مصادر الدين؛ المتأخر أولًا ثم الأكبر قيمة. الأرصدة بلا استحقاق متفق عليه لا تصنّف متأخرة.</p></div><button aria-label="تحديث دفتر الذمم" onClick={()=>setVersion(v=>v+1)} className={selectClass}><RefreshCw className="h-4 w-4"/></button></div>
  <div className="flex flex-wrap gap-2"><label className="flex flex-1 items-center gap-2 rounded-lg border px-3"><Search className="h-4 w-4"/><input aria-label="بحث دفتر الذمم" placeholder="اسم العميل أو رقم الفاتورة" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="w-full min-w-40 bg-transparent py-2 text-sm outline-none"/></label>
   <select aria-label="مصدر الدين" className={selectClass} value={source} onChange={e=>{setSource(e.target.value);setPage(1);}}><option value="ALL">جميع المصادر</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select aria-label="تقادم الدين" className={selectClass} value={aging} onChange={e=>{setAging(e.target.value);setPage(1);}}><option value="ALL">كل الاستحقاقات</option><option value="OVERDUE">متأخر فقط</option><option value="CURRENT">ضمن المهلة / بلا تاريخ</option><option value="D90_PLUS">أكثر من 90 يومًا</option></select>
   <button disabled={loading||!!error||!data.rows.length} className={selectClass} onClick={()=>exportToExcel(data.rows.map(r=>({...r,source:labels[r.source]})),[{header:'العميل',key:'customer',width:24},{header:'المرجع',key:'reference',width:22},{header:'المصدر',key:'source',width:20},{header:'المتبقي (د.ع)',key:'remaining',width:20}], 'دفتر_الذمم_الصفحة_'+page,'الذمم')}><Download className="inline h-4 w-4"/> تصدير الصفحة</button>
  </div>
  {!loading&&!error&&<p className="text-sm">إجمالي النتائج المطابقة: <strong>{data.filteredOutstanding.toLocaleString('ar-IQ-u-nu-latn')} د.ع</strong></p>}
  <ListPages page={page} total={data.total} loading={loading} error={error} setPage={setPage}/>
  {!loading&&!error&&(data.rows.length?<div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-right"><tr>{['العميل والمرجع','المصدر','المتبقي (د.ع)','الاستحقاق','المتابعة'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.rows.map(r=><tr key={r.source+r.id} className="border-t"><td className="p-3"><b>{r.customer}</b><div dir="ltr" className="mt-1 text-right text-xs text-muted-foreground">{r.reference}</div></td><td className="p-3 whitespace-nowrap">{labels[r.source]}</td><td className="p-3 font-bold tabular-nums">{r.remaining.toLocaleString('ar-IQ-u-nu-latn')}</td><td className={'p-3 '+(r.aging!=='CURRENT'?'text-destructive':'text-muted-foreground')}>{r.dueAt?new Date(r.dueAt).toLocaleDateString('ar-IQ-u-nu-latn'):'بلا تاريخ محدد'}</td><td className="p-3">{r.organizationId?<Link className="text-primary underline whitespace-nowrap" href={'/warehouse/print/statement/'+r.organizationId}>كشف الحساب</Link>:<span>عميل تاريخي غير مربوط</span>}</td></tr>)}</tbody></table></div>:<EmptyState title="لا توجد ذمم مطابقة" description="جرّب تغيير المصدر أو الاستحقاق أو البحث."/>)}
 </section>;
}
