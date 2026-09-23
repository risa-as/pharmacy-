'use client';
import { useEffect, useState, useRef } from 'react';
import { Activity, ArrowDownLeft, CalendarDays, RefreshCw, TrendingUp, Wallet, ShieldAlert, PackageCheck, Download } from 'lucide-react';
import { exportToExcel } from '@/app/lib/excel-export';
import EmptyState from '../_components/EmptyState';
type Point={key:string;total:number;orders:number;quantity:number};
type Snapshot={sales:Point[];previous:Point[];fulfilment:{ratePercent:number;totalLines:number;outOfStock:number;partial:number};expiry:{byBucket:Record<string,{quantity:number;value:number}>};finance?:{outstanding:number;overdue:number};payables?:{summary:{outstanding:number;overdue:number}};updated:string};
const money=(n:number)=>n.toLocaleString('ar-IQ-u-nu-latn',{maximumFractionDigits:2});
const today=()=>new Date(Date.now()+3*3600000).toISOString().slice(0,10);
const before=(days:number)=>new Date(Date.now()+3*3600000-days*86400000).toISOString().slice(0,10);
export default function MonitoringOverview({active,refreshToken,canViewFinance,canViewPayables,onInspect}:{active:boolean;refreshToken:number;canViewFinance:boolean;canViewPayables:boolean;onInspect:(tab:string)=>void}){
 const loadedAt=useRef(0);
 useEffect(()=>{if(active && loadedAt.current && Date.now()-loadedAt.current>=60_000)setRevision(v=>v+1);},[active]);
 const [from,setFrom]=useState(before(29)),[to,setTo]=useState(today()),[revision,setRevision]=useState(0);
 const [data,setData]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');
 async function load(){try{
  const start=new Date(from+'T00:00:00+03:00'),end=new Date(to+'T23:59:59.999+03:00');
  const span=end.getTime()-start.getTime()+1;
  if(!Number.isFinite(span)||span<=0||span>366*86400000)throw Error('اختر فترة صحيحة لا تتجاوز سنة.');
  const query=new URLSearchParams({from:start.toISOString(),to:end.toISOString(),period:'day'});
  const previous=new URLSearchParams({from:new Date(start.getTime()-span).toISOString(),to:new Date(start.getTime()-1).toISOString(),period:'day'});
  const get=async(path:string)=>{const res=await fetch('/api/warehouse-portal/'+path,{signal:abort.signal});const json=await res.json();if(!res.ok)throw Error(json.error||'تعذر تحميل المؤشرات');return json;};
  const [sales,prior,fulfilment,expiry,finance,payables]=await Promise.all([get('reports/sales?'+query),get('reports/sales?'+previous),get('reports/fulfilment?'+query),get('reports/expiry-risk'),canViewFinance?get('accounts/summary'):undefined,canViewPayables?get('reports/payables'):undefined]);
  if(!abort.signal.aborted){loadedAt.current=Date.now();setData({sales:sales.series,previous:prior.series,fulfilment,expiry,finance,payables,updated:new Date().toLocaleTimeString('ar-IQ-u-nu-latn',{timeZone:'Asia/Baghdad'})});}
 }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'تعذر الاتصال');}finally{if(!abort.signal.aborted)setLoading(false);}}
 void load();return()=>abort.abort();},[from,to,revision,refreshToken,canViewFinance,canViewPayables]);
 const total=data?.sales.reduce((s,p)=>s+p.total,0)??0,previous=data?.previous.reduce((s,p)=>s+p.total,0)??0;
 const delta=previous>0?100*(total-previous)/previous:null;
 const risk=data?['EXPIRED','CRITICAL'].reduce((s,k)=>s+(data.expiry.byBucket[k]?.value??0),0):0;
 const riskQuantity=data?['EXPIRED','CRITICAL'].reduce((s,k)=>s+(data.expiry.byBucket[k]?.quantity??0),0):0;
 const cards=data?[
  {title:'صافي المبيعات',value:money(total)+' د.ع',note:delta===null?'لا تتوفر قاعدة موجبة للمقارنة':`${delta>=0?'ارتفاع':'انخفاض'} ${money(Math.abs(delta))}٪ عن الفترة السابقة المساوية`,icon:TrendingUp,tab:'sales'},
  {title:'نسبة تلبية الطلبات',value:data.fulfilment.totalLines?money(data.fulfilment.ratePercent)+'٪':'—',note:money(data.fulfilment.totalLines)+' بند محسوم خلال الفترة',icon:PackageCheck,tab:'fulfilment'},
  {title:'قيمة مخزون يحتاج متابعة',value:money(risk)+' د.ع',note:money(riskQuantity)+' وحدة منتهية أو تنتهي خلال 90 يومًا · رصيد حالي',icon:ShieldAlert,tab:'expiry-risk'},
  ...(data.finance?[{title:'ذمم العملاء القائمة',value:money(data.finance.outstanding)+' د.ع',note:'منها متأخر '+money(data.finance.overdue)+' د.ع · رصيد حالي',icon:Wallet,tab:'finance'}]:[]),
 ]:[];
 return <div className="space-y-4">
  <section className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold"><Activity className="h-5 w-5 text-primary"/> لوحة مراقبة الأعمال</h3><p className="mt-1 text-sm text-muted-foreground">مبيعات وأداء ومخاطر قابلة للمتابعة، بمقارنة فترة مماثلة.</p></div><button onClick={()=>setRevision(v=>v+1)} disabled={loading} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')}/> تحديث</button></div>
  <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-3"><CalendarDays className="mb-2 h-5 w-5 text-muted-foreground"/><label className="text-xs">من<input aria-label="بداية فترة المراقبة" type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} className="mt-1 block rounded-lg border bg-background px-3 py-2 text-sm"/></label><label className="text-xs">إلى<input aria-label="نهاية فترة المراقبة" type="date" value={to} min={from} max={today()} onChange={e=>setTo(e.target.value)} className="mt-1 block rounded-lg border bg-background px-3 py-2 text-sm"/></label>{[7,30,90].map(days=><button key={days} onClick={()=>{setFrom(before(days-1));setTo(today());}} className="rounded-lg bg-muted px-3 py-2 text-sm">{money(days)} يومًا</button>)}<span className="text-xs text-muted-foreground">توقيت بغداد</span></div></section>
  {loading?<div role="status" className="rounded-lg border bg-card p-8 text-center text-muted-foreground">جارٍ تحديث مؤشرات الفترة…</div>:error?<div role="alert" className="rounded-lg border border-destructive/30 p-4 text-destructive">{error}</div>:data&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(c=><button key={c.title} onClick={()=>onInspect(c.tab)} className="rounded-lg border bg-card p-4 text-right transition-colors hover:border-primary"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{c.title}</span><c.icon className="h-5 w-5 text-primary"/></div><div className="my-3 text-xl font-bold tabular-nums">{c.value}</div><div className="flex items-start justify-between gap-2 text-xs leading-relaxed text-muted-foreground"><span>{c.note}</span><ArrowDownLeft className="h-4 w-4 shrink-0"/></div></button>)}</div>
   <div className="grid gap-4 lg:grid-cols-[2fr_1fr]"><section className="min-w-0 rounded-lg border bg-card p-4"><div className="mb-4 flex justify-between gap-2"><h3 className="font-bold">حركة المبيعات اليومية</h3><button disabled={!data.sales.length} onClick={()=>exportToExcel(data.sales,[{header:'التاريخ',key:'key',width:18},{header:'صافي المبيعات (د.ع)',key:'total',width:24},{header:'الطلبات',key:'orders',width:15},{header:'الكمية',key:'quantity',width:15}],'مراقبة_المبيعات_'+from+'_'+to,'المبيعات')} className="flex items-center gap-1 text-sm text-primary"><Download className="h-4 w-4"/> تصدير</button></div>
   {data.sales.length?<div className="max-h-80 space-y-3 overflow-auto">{data.sales.map(p=>{const max=Math.max(1,...data.sales.map(x=>Math.abs(x.total)));return <div key={p.key} className="grid grid-cols-[88px_1fr_100px] items-center gap-3 text-xs"><span dir="ltr">{p.key}</span><div className="h-5 rounded-md bg-muted"><div className={'h-5 rounded-md '+(p.total<0?'bg-destructive':'bg-primary')} style={{width:Math.max(1,Math.abs(p.total)/max*100)+'%'}}/></div><b className="tabular-nums">{money(p.total)} د.ع</b></div>;})}</div>:<EmptyState title="لا توجد مبيعات في الفترة" description="اختر فترة أخرى للاطلاع على النشاط."/>}
   <p className="mt-4 text-xs text-muted-foreground">المبيعات المشحونة والميدانية بعد خصم المرتجعات بتاريخ قبولها؛ ليست قيمة المقبوضات. الأحمر يمثل صافيًا سالبًا.</p></section>
   <section className="rounded-lg border bg-card p-4"><h3 className="mb-3 font-bold">أولويات المتابعة</h3><div className="divide-y text-sm"><button onClick={()=>onInspect('expiry-risk')} className="flex w-full justify-between gap-3 py-3 text-right"><span>مراجعة الأصناف المنتهية والقريبة</span><b>{money(riskQuantity)} وحدة</b></button><button onClick={()=>onInspect('fulfilment')} className="flex w-full justify-between gap-3 py-3 text-right"><span>بنود جزئية أو غير متوفرة</span><b>{money(data.fulfilment.partial+data.fulfilment.outOfStock)}</b></button>{data.finance&&<button onClick={()=>onInspect('finance')} className="flex w-full justify-between gap-3 py-3 text-right"><span>متابعة تحصيل المتأخر</span><b>{money(data.finance.overdue)} د.ع</b></button>}{data.payables&&<button onClick={()=>onInspect('payables')} className="flex w-full justify-between gap-3 py-3 text-right"><span>مستحقات الموردين المتأخرة</span><b>{money(data.payables.summary.overdue)} د.ع</b></button>}</div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">المخزون والذمم أرصدة حالية؛ فلتر التاريخ يخص المبيعات والتلبية. آخر قراءة: {data.updated}.</p></section></div>
  </>}
 </div>;
}
