import {useEffect, useState} from 'react';
import {Check, Copy, ShieldCheck} from 'lucide-react';
import {deviceComparisonCode} from '../../../../packages/shared/src/device-comparison-code';

export default function DeviceProtection() {
  const [fingerprint,setFingerprint]=useState('');
  const [code,setCode]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [server,setServer]=useState('');
  const [copied,setCopied]=useState(false);
  const [status,setStatus]=useState<string | null>(null);
  const [sessionReady,setSessionReady]=useState(false);
  async function refreshLocalState() {
    const s=await window.ipcRenderer.invoke('device-signing:status');
    setFingerprint(s.configured?.fingerprint||'');setServer(s.server||'');
    setStatus(s.status||null);setSessionReady(!!s.sessionReady);
    return s;
  }
  useEffect(()=>{void refreshLocalState().then(s=>setMessage(s.error||'')).catch(()=>setMessage('تعذر قراءة حالة الجهاز.'));},[]);
  useEffect(()=>{
    let current=true; setCode(''); setCopied(false);
    if(fingerprint) void deviceComparisonCode(fingerprint).then(value=>{if(current)setCode(value);}).catch(()=>{if(current)setMessage('تعذر عرض رمز المطابقة. حدّث حالة الجهاز أو تواصل مع الدعم.');});
    return ()=>{current=false;};
  },[fingerprint]);
  async function enrol() {
    setBusy(true); setMessage('');
    try {
      const r=await window.ipcRenderer.invoke('device-signing:enrol');
      if(!r.success) throw Error(r.error);
      setFingerprint(r.fingerprint);
      const local=await refreshLocalState();
      setMessage(r.status==='ACTIVE'?(local.sessionReady?'الجهاز معتمد وجلسة الدخول مرتبطة به. لا يلزم إجراء إضافي.':'الجهاز معتمد. سجّل الخروج ثم الدخول مجددًا لإكمال التفعيل.'):r.status==='REVOKED'?'اعتماد الجهاز ملغى؛ تواصل مع مدير المنصة.':'تم إرسال الطلب. شارك رمز المطابقة مع مدير المنصة لاعتماد هذا الجهاز.');
    } catch(e) {setMessage(e instanceof Error?e.message:'تعذر تسجيل الجهاز.');}
    finally {setBusy(false);}
  }
  async function copy() {
    try {await navigator.clipboard.writeText(code); setCopied(true);}
    catch {setMessage('تعذر النسخ. يمكنك تحديد الرمز ونسخه يدويًا.');}
  }
  return <section className="bg-card border border-border rounded-lg p-4 space-y-4" dir="rtl">
    <div className="flex items-start gap-3"><div className="rounded-md bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div><div><h3 className="font-bold">{status==='ACTIVE'?'الجهاز معتمد':status==='PENDING'?'بانتظار اعتماد الجهاز':status==='REVOKED'?'اعتماد الجهاز ملغى':'اعتماد هذا الجهاز'}</h3><p className="mt-1 text-sm text-muted-foreground">{status==='ACTIVE'?(sessionReady?'اكتمل إعداد جلسة الجهاز. لا تحتاج إلى إدخال رمز عند البيع.':'تم الاعتماد. سجّل الدخول عبر الإنترنت لإكمال إعداد الجلسة.'):'إعداد مرة واحدة لحماية اتصال الجهاز. لا تحتاج إلى إدخال رمز عند البيع.'}</p>{status&&<p className="mt-1 text-xs text-muted-foreground">آخر حالة مؤكدة؛ استخدم التحديث للتحقق من أي تغيير.</p>}</div></div>
    {code&&status!=='ACTIVE'&&<div className="rounded-md border border-border bg-muted/30 p-3 text-center"><p className="mb-2 text-xs text-muted-foreground">رمز المطابقة مع مدير المنصة</p><code className="block select-all font-mono text-xl font-bold tracking-wider" dir="ltr">{code}</code><button type="button" onClick={()=>void copy()} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10">{copied?<Check className="h-3.5 w-3.5" />:<Copy className="h-3.5 w-3.5" />}{copied?'تم النسخ':'نسخ الرمز'}</button></div>}
    <button type="button" disabled={busy} onClick={enrol} className="rounded-md px-3 py-2 bg-primary text-primary-foreground disabled:opacity-50">{busy?'جارٍ التحقق…':fingerprint?'تحديث حالة الاعتماد':'طلب اعتماد الجهاز'}</button>
    {message&&<p className="text-sm leading-6" role="status">{message}</p>}
    <p className="text-xs text-muted-foreground">إذا تعذّر الاعتماد، تبقى العمليات محفوظة على الجهاز. تواصل مع الدعم قبل تغيير الجهاز أو إعادة تثبيت Windows.</p>
    <details className="border-t border-border pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">تفاصيل للدعم الفني</summary><div className="mt-3 space-y-2">{status==='ACTIVE'&&code&&<p>رمز المطابقة: <code dir="ltr" className="inline-block select-all font-mono">{code}</code></p>}{server&&<p>الخادم المتصل: <bdi dir="ltr">{server}</bdi></p>}{fingerprint&&<><p>بصمة الجهاز الكاملة</p><code dir="ltr" className="block break-all select-all font-mono leading-5">{fingerprint}</code></>}</div></details>
  </section>;
}
