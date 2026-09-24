'use client';
import {useEffect,useState} from 'react';
export default function DeviceSigningPanel() {
  const [keys,setKeys]=useState<any[]>([]),[enabled,setEnabled]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState('');
  async function load(){try{const r=await fetch('/api/admin/device-signing');if(!r.ok)throw Error('تعذر قراءة اعتمادات الأجهزة');const d=await r.json();setKeys(d.keys);setEnabled(d.enabled);}catch(e){setError(String(e));}}
  useEffect(()=>{void load();},[]);
  async function act(key:any,action:string){
    const text=action==='approve'?'طابق البصمة كاملة مع الجهاز عبر قناة موثوقة. الاعتماد يلزم هذا الترخيص بتوقيع الطلبات وقد يوقف مزامنة نسخة قديمة. هل تؤكد؟':action==='reset'?'إعادة التسجيل تزيل ربط المفتاح الملغى. سيحتاج الجهاز طلب اعتماد جديد. احتفظ بنسخة من عملياته المعلقة. هل تؤكد؟':'سيُرفض هذا المفتاح حتى تتم إعادة تسجيل الجهاز. هل تؤكد؟';
    if(!window.confirm(text))return;
    setBusy(key.id);setError('');
    try{const r=await fetch('/api/admin/device-signing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:key.id,fingerprint:key.fingerprint,action})});if(!r.ok)throw Error((await r.json()).error);await load();}catch(e){setError(String(e));}finally{setBusy('');}
  }
  return <section className="border border-border rounded-lg p-4 space-y-3">
    <h2 className="font-bold">اعتماد مفاتيح أجهزة سطح المكتب</h2>
    <p className="text-sm text-muted-foreground">{enabled?'المفتاح يثبت حيازة الجهاز وقت الإرسال؛ لا يثبت مَن ضغط زر البيع. طابق البصمة قبل الاعتماد.':'الميزة غير مفعلة. يلزم ترحيل قاعدة البيانات وتجربة الأجهزة قبل التفعيل.'}</p>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {keys.map(k=><div key={k.id} className="border-t border-border pt-3 space-y-2">
      <p>{k.license.branch.organization?.name} — {k.license.branch.name} — {k.license.deviceName||'جهاز'} — {k.status==='ACTIVE'?'معتمد':k.status==='PENDING'?'بانتظار الاعتماد':'ملغى'}</p>
      <p dir="ltr" className="font-mono text-xs break-all select-all">{k.fingerprint}</p>
      <div className="flex gap-2">{(k.status==='PENDING'?['approve','revoke']:k.status==='ACTIVE'?['revoke']:['reset']).map(a=><button key={a} disabled={!!busy} onClick={()=>act(k,a)} className="border border-border rounded-md px-3 py-1.5 text-sm disabled:opacity-50">{busy===k.id?'جارٍ التنفيذ…':a==='approve'?'اعتماد البصمة':a==='reset'?'السماح بإعادة التسجيل':'إلغاء الاعتماد'}</button>)}</div>
    </div>)}
  </section>;
}
