'use client';

import {useEffect, useRef, useState} from 'react';
import {deviceComparisonCode} from '../../../../../../packages/shared/src/device-comparison-code';
import {Building2, Check, Clock3, Copy, Fingerprint, Loader2, Monitor, RefreshCw, ShieldCheck, ShieldOff, X} from 'lucide-react';

type KeyStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';
type Action = 'approve' | 'revoke' | 'reset';
interface DeviceKey {
  id: string;
  fingerprint: string;
  status: KeyStatus;
  comparisonCode?: string;
  license: {deviceName: string | null; branch: {name: string; organization?: {name: string} | null}};
}
const statuses = {
  PENDING: {label: 'بانتظار الاعتماد', icon: Clock3, tone: 'bg-warning/10 text-warning'},
  ACTIVE: {label: 'معتمد', icon: ShieldCheck, tone: 'bg-success/10 text-success'},
  REVOKED: {label: 'ملغى', icon: ShieldOff, tone: 'bg-destructive/10 text-destructive'},
};
const actions = {
  approve: {title: 'اعتماد مفتاح الجهاز', button: 'تأكيد الاعتماد', message: 'سيُلزم هذا الترخيص بتوقيع طلباته بالمفتاح المعروض. تأكد من تحديث تطبيق الجهاز؛ النسخ القديمة قد تتوقف عن المزامنة.'},
  revoke: {title: 'إلغاء اعتماد الجهاز', button: 'إلغاء الاعتماد', message: 'ستُرفض طلبات هذا المفتاح. تبقى العمليات المحلية محفوظة، ويحتاج الجهاز إلى إعادة التسجيل والاعتماد لاستئناف المزامنة.'},
  reset: {title: 'السماح بإعادة التسجيل', button: 'السماح بإعادة التسجيل', message: 'سيُزال ربط المفتاح الملغى ليتمكن الجهاز من إرسال طلب جديد. احتفظ بعملياته المعلقة؛ الطلب الجديد يحتاج اعتمادًا منفصلًا.'},
};
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

function FingerprintValue({value}: {value: string}) {
  return <code dir="ltr" className="block break-all select-all font-mono text-xs leading-6 text-foreground">{value}</code>;
}

export default function DeviceSigningPanel() {
  const [keys, setKeys] = useState<DeviceKey[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{key: DeviceKey; action: Action} | null>(null);
  const [matched, setMatched] = useState(false);
  const [modalError, setModalError] = useState('');
  const [copied, setCopied] = useState('');
  const modalRef = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/device-signing', {cache: 'no-store'});
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw Error(data?.error || 'تعذر قراءة اعتمادات الأجهزة. أعد المحاولة.');
      const records: DeviceKey[] = Array.isArray(data.keys) ? data.keys : [];
      setKeys(await Promise.all(records.map(async key => ({...key, comparisonCode: await deviceComparisonCode(key.fingerprint).catch(() => '')})))); setEnabled(data.enabled === true);
    } catch (e) {setError(e instanceof Error ? e.message : 'تعذر الاتصال بالخادم.');}
    finally {setLoading(false);}
  }
  useEffect(() => {void load();}, []);
  useEffect(() => {
    if (selected && !modalRef.current?.open) modalRef.current?.showModal();
    if (!selected && modalRef.current?.open) modalRef.current.close();
  }, [selected]);

  function open(key: DeviceKey, action: Action) {
    setMatched(false); setModalError(''); setSelected({key, action});
  }
  function close() {if (!sending.current) setSelected(null);}
  async function copy(key: DeviceKey) {
    try {await navigator.clipboard.writeText(key.comparisonCode || key.fingerprint); setCopied(key.id);}
    catch {setError('تعذر النسخ. يمكنك تحديد البصمة ونسخها يدويًا.');}
  }
  async function submit() {
    if (!selected || sending.current || (selected.action === 'approve' && (!matched || !selected.key.comparisonCode))) return;
    sending.current = true; setBusy(true); setModalError(''); setNotice('');
    try {
      const {key, action} = selected;
      const response = await fetch('/api/admin/device-signing', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: key.id, fingerprint: key.fingerprint, action})});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw Error(data?.error || 'تعذر تنفيذ الإجراء. حدّث الحالة قبل إعادة المحاولة.');
      setSelected(null);
      setNotice(action === 'approve' ? 'تم اعتماد الجهاز. حدّث حالة الاعتماد في التطبيق، ثم سجّل الدخول مجددًا.' : action === 'revoke' ? 'تم إلغاء اعتماد الجهاز.' : 'يمكن للجهاز الآن إرسال طلب تسجيل جديد.');
      await load();
    } catch (e) {setModalError(e instanceof Error ? e.message : 'تعذر الاتصال بالخادم.');}
    finally {sending.current = false; setBusy(false);}
  }

  return <section className="overflow-hidden rounded-lg border border-border bg-card text-foreground" dir="rtl" aria-labelledby="device-keys-title">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-3 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
        <div><h2 id="device-keys-title" className="text-base font-bold">اعتماد مفاتيح أجهزة سطح المكتب</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">راجع الجهاز وطابق رمز المطابقة مع التطبيق قبل الاعتماد. المفتاح يثبت حيازة الجهاز وقت الإرسال، ولا يثبت مَن ضغط زر البيع.</p></div>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading || busy} className={`${buttonClass} border border-border hover:bg-muted`}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />تحديث</button>
    </div>
    <div className="space-y-4 p-4 sm:p-5" aria-busy={loading}>
      {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">{notice}</p>}
      {loading && keys.length === 0 ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل الأجهزة…</div> : enabled === false ? <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">الميزة غير مفعلة. يلزم ترحيل قاعدة البيانات وتجربة الأجهزة قبل التفعيل.</p> : enabled && <>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {(Object.keys(statuses) as KeyStatus[]).map(status => {const meta = statuses[status]; return <div key={status} className="rounded-md border border-border bg-muted/20 px-3 py-3"><p className="text-xs text-muted-foreground">{meta.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{keys.filter(key => key.status === status).length.toLocaleString('en-US')}</p></div>;})}
        </div>
        {keys.length === 0 ? <div className="flex flex-col items-center py-10 text-center"><Monitor className="mb-3 h-9 w-9 text-muted-foreground" /><h3 className="font-semibold">لا توجد طلبات اعتماد بعد</h3><p className="mt-2 text-sm text-muted-foreground">أرسل طلب التسجيل من إعدادات تطبيق سطح المكتب، ثم حدّث هذه القائمة.</p></div> : <div className="grid gap-3 xl:grid-cols-2">{keys.map(key => {
          const meta = statuses[key.status] || statuses.REVOKED; const StatusIcon = meta.icon;
          return <article key={key.id} className="min-w-0 overflow-hidden rounded-lg border border-border">
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><div className="rounded-md bg-muted p-2.5"><Monitor className="h-5 w-5 text-primary" /></div><div className="min-w-0"><h3 className="break-words font-bold">{key.license.deviceName || 'جهاز سطح المكتب'}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5 shrink-0" /><span>{key.license.branch.organization?.name || 'المؤسسة'} · {key.license.branch.name}</span></p></div></div>
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${meta.tone}`}><StatusIcon className="h-3.5 w-3.5" />{meta.label}</span>
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2"><div className="mb-1 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Fingerprint className="h-4 w-4" />رمز المطابقة</span><button type="button" onClick={() => void copy(key)} aria-label={`نسخ رمز ${key.license.deviceName || 'الجهاز'}`} className="inline-flex items-center gap-1 rounded-md p-1 text-xs text-primary hover:bg-primary/10">{copied === key.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === key.id ? 'تم النسخ' : 'نسخ'}</button></div>{key.comparisonCode ? <code dir="ltr" className="block select-all font-mono text-lg font-bold tracking-wider">{key.comparisonCode}</code> : <p className="text-xs text-destructive">تعذر توليد رمز المطابقة؛ حدّث القائمة قبل الاعتماد.</p>}<details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">البصمة الكاملة</summary><FingerprintValue value={key.fingerprint} /></details></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-4 py-3">
              {key.status === 'PENDING' && <button type="button" disabled={busy || loading} onClick={() => open(key, 'approve')} className={`${buttonClass} bg-primary text-primary-foreground hover:bg-primary/90`}><ShieldCheck className="h-4 w-4" />مراجعة واعتماد</button>}
              {key.status !== 'REVOKED' ? <button type="button" disabled={busy || loading} onClick={() => open(key, 'revoke')} className={`${buttonClass} border border-border text-destructive hover:bg-destructive/5`}><ShieldOff className="h-4 w-4" />إلغاء الاعتماد</button> : <button type="button" disabled={busy || loading} onClick={() => open(key, 'reset')} className={`${buttonClass} border border-border hover:bg-muted`}><RefreshCw className="h-4 w-4" />السماح بإعادة التسجيل</button>}
            </div>
          </article>;
        })}</div>}
      </>}
    </div>
    <dialog ref={modalRef} onCancel={event => {event.preventDefault(); close();}} onClose={() => {if (!sending.current) setSelected(null);}} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50" dir="rtl" aria-labelledby="device-decision-title" aria-describedby="device-decision-description">
      {selected && <>
        <div className="flex items-center justify-between gap-3 border-b border-border p-5"><h3 id="device-decision-title" className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-primary" />{actions[selected.action].title}</h3><button type="button" autoFocus disabled={busy} onClick={close} aria-label="إغلاق" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4 p-5">
          <div><p className="font-semibold">{selected.key.license.deviceName || 'جهاز سطح المكتب'}</p><p className="mt-1 text-sm text-muted-foreground">{selected.key.license.branch.organization?.name} · {selected.key.license.branch.name}</p></div>
          <div className="rounded-md border border-border bg-muted/30 p-3"><p className="mb-1 text-xs text-muted-foreground">طابق المجموعات الثلاث مع الرمز الظاهر في التطبيق</p><code dir="ltr" className="block select-all text-center font-mono text-xl font-bold tracking-wider">{selected.key.comparisonCode || 'الرمز غير متاح'}</code><details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">عرض البصمة الكاملة</summary><FingerprintValue value={selected.key.fingerprint} /></details></div>
          <p id="device-decision-description" className="text-sm leading-7 text-muted-foreground">{actions[selected.action].message}</p>
          {selected.action === 'approve' && <label className="flex cursor-pointer items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm leading-6"><input type="checkbox" checked={matched} disabled={busy} onChange={event => setMatched(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" /><span>طابقت رمز المطابقة مع التطبيق على الجهاز المقصود وتأكدت من تحديثه.</span></label>}
          {modalError && <p role="alert" className="text-sm text-destructive">{modalError}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 p-4"><button type="button" disabled={busy} onClick={close} className={`${buttonClass} border border-border hover:bg-muted`}>تراجع</button><button type="button" disabled={busy || (selected.action === 'approve' && (!matched || !selected.key.comparisonCode))} onClick={() => void submit()} className={`${buttonClass} ${selected.action === 'revoke' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'جارٍ التنفيذ…' : actions[selected.action].button}</button></div>
      </>}
    </dialog>
  </section>;
}
