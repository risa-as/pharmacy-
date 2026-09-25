import { Fragment, useEffect, useRef, useState } from "react";
import { Search, Printer, Undo2, RefreshCw, ReceiptText, Wallet, BarChart3, ChevronDown, ChevronUp, CheckCircle2, Clock3, AlertCircle } from "lucide-react";
import SaleReturnModal from "./SaleReturnModal";
import InvoicePrint from "./InvoicePrint";
import { saleLabel } from "./pos/pos-utils";
const btn =
  "rounded-lg border border-border px-3 py-2 text-sm inline-flex gap-2 items-center disabled:opacity-40 hover:bg-muted";
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const money = (v: number) => Number(v || 0).toLocaleString("en-US");
export default function StaffSalesPage({ user }: { user: any }) {
  const [search, setSearch] = useState(""),
    [period, setPeriod] = useState("today"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [data, setData] = useState<any>(null),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<any>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [returns, setReturns] = useState(false),
    [settings, setSettings] = useState<any>(null);
  const generation = useRef(0),
    receipt = useRef<HTMLDivElement>(null);
  const applied = useRef({ search: '', period: 'today', from: '', to: '' });
  const [filterLabel, setFilterLabel] = useState('اليوم');
  async function load(p = 1, apply = false) {
    const filters = apply ? { search: search.trim(), period, from, to } : applied.current;
    if (filters.period === 'custom' && (!filters.from || !filters.to || filters.from > filters.to)) {
      setError('حدد بداية ونهاية صحيحتين للفترة.'); return;
    }
    const { search: term, period: range, from: startDate, to: endDate } = filters;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (range === "week") start.setDate(start.getDate() - 6);
      const result = await window.ipcRenderer.invoke("staff:sales", {
        page: p,
        search: term,
        from:
          range === "custom"
            ? startDate
              ? new Date(startDate + "T00:00:00").toISOString()
              : undefined
            : range === "all"
              ? undefined
              : start.toISOString(),
        to:
          range === "custom" && endDate
            ? new Date(endDate + "T23:59:59.999").toISOString()
            : undefined,
      });
      if (request !== generation.current) return;
      if (!result.success) throw Error(result.error);
      applied.current = filters;
      setFilterLabel((range === 'today' ? 'اليوم' : range === 'week' ? 'آخر 7 أيام' : range === 'all' ? 'جميع الفترات' : startDate + ' — ' + endDate) + (term ? ' · ' + term : ''));
      setData(result);
      setPage(p);
      setSelected(null);
    } catch (e) {
      if (request === generation.current) {
        setData(null);
        setError(e instanceof Error ? e.message : "تعذر التحميل");
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load(1, true);
    return () => {
      generation.current++;
    };
  }, []);
  useEffect(() => {
    window.ipcRenderer
      .invoke("get-company-settings")
      .then(setSettings)
      .catch(() => {});
  }, []);
  function print() {
    if (!receipt.current) return;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    const style = doc.createElement("style");
    style.textContent =
      "body{font:14px Arial;direction:rtl;margin:10px} table{width:100%;border-collapse:collapse}td,th{padding:6px;text-align:right;border-bottom:1px solid #ddd} @page{margin:5mm} .text-center{text-align:center}";
    doc.head.appendChild(style);
    doc.body.appendChild(receipt.current.cloneNode(true));
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  }
  return (
    <div className="p-6 space-y-4" dir="rtl">
      <header className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><ReceiptText size={24} /></span>
          <div><h1 className="text-2xl font-bold">سجل المبيعات</h1><p className="text-sm text-muted-foreground mt-1">ابحث عن فاتورة، راجع تفاصيلها، وأعد طباعتها أو عالج المرتجع.</p></div>
        </div>
        <button className={btn} disabled={busy || returns} onClick={() => void load(page)}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />تحديث السجل</button>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'عدد الفواتير', value: data ? money(data.total) : '—', icon: ReceiptText, hint: 'للفترة والبحث المحددين' },
          { label: 'إجمالي الفواتير', value: data ? money(data.amount) + ' د.ع' : '—', icon: Wallet, hint: 'قبل خصم المرتجعات' },
          { label: 'متوسط الفاتورة', value: data ? money(data.total ? Math.round(data.amount / data.total) : 0) + ' د.ع' : '—', icon: BarChart3, hint: 'الإجمالي ÷ عدد الفواتير' },
        ].map(stat => <div key={stat.label} className="rounded-xl border border-border bg-card p-5"><div className="flex justify-between items-center text-muted-foreground text-sm"><span>{stat.label}</span><stat.icon size={18} className="text-primary" /></div><strong className="block text-2xl mt-3 tabular-nums">{stat.value}</strong><p className="text-xs text-muted-foreground mt-2">{stat.hint}</p></div>)}
      </div>
      <form className="rounded-xl border border-border bg-card p-4 space-y-3" onSubmit={e => { e.preventDefault(); void load(1, true); }}>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-56 text-sm"><span className="block mb-2 font-medium">البحث عن فاتورة</span><div className="relative"><Search size={17} className="absolute right-3 top-3 text-muted-foreground" /><input className={field + ' w-full pr-10'} placeholder="رقم الفاتورة، اسم العميل أو الهاتف" value={search} onChange={e => setSearch(e.target.value)} /></div></label>
          <label className="text-sm"><span className="block mb-2 font-medium">الفترة</span><select className={field + ' min-w-40'} value={period} onChange={e => setPeriod(e.target.value)}><option value="today">اليوم</option><option value="week">آخر 7 أيام</option><option value="all">كل الفواتير</option><option value="custom">فترة مخصصة</option></select></label>
          {period === 'custom' && <><label className="text-sm"><span className="block mb-2">من تاريخ</span><input required type="date" className={field} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label className="text-sm"><span className="block mb-2">إلى تاريخ</span><input required type="date" className={field} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></>}
          <button className={btn + ' bg-primary text-primary-foreground hover:bg-primary/90'} disabled={busy || returns}><Search size={16} />عرض النتائج</button>
        </div>
        <p className="text-xs text-muted-foreground">فواتير هذا الجهاز في فرعك، بما فيها الفواتير بانتظار المزامنة.</p>
      </form>
      {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle size={18} />{error}<button className={btn + ' mr-auto'} disabled={busy} onClick={() => void load(page)}>إعادة المحاولة</button></div>}
      <section className="rounded-xl border border-border bg-card overflow-hidden" aria-label="الفواتير">
        <div className="flex flex-wrap justify-between gap-2 p-4 border-b border-border"><h2 className="font-semibold">الفواتير <span className="font-normal text-xs text-muted-foreground mr-2">{filterLabel}</span></h2><span role="status" className="text-xs text-muted-foreground">{busy ? 'جارٍ تحميل الفواتير…' : data ? money(data.total) + ' نتيجة' : ''}</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-muted/40 text-muted-foreground"><tr>{['الفاتورة / التاريخ', 'العميل', 'طريقة الدفع', 'الإجمالي', 'المزامنة', 'التفاصيل'].map(title => <th key={title} className="px-4 py-3 font-medium whitespace-nowrap">{title}</th>)}</tr></thead><tbody>
          {busy && !data && Array.from({ length: 6 }, (_, row) => <tr key={row} aria-hidden="true" className="border-t border-border">{Array.from({ length: 6 }, (_, col) => <td key={col} className="p-4"><div className="h-4 w-3/4 rounded bg-muted motion-safe:animate-pulse" /></td>)}</tr>)}
          {data?.sales.map((sale: any) => <Fragment key={sale.id}>
            <tr className={`border-t border-border transition-colors ${selected?.id === sale.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
              <td className="p-4"><strong dir="ltr" className="font-mono">{saleLabel(sale)}</strong><p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">{new Date(sale.createdAt).toLocaleString('ar-IQ-u-nu-latn')}</p></td>
              <td className="p-4"><span>{sale.patient?.name || 'بيع مباشر'}</span>{sale.patient?.phone && <p className="text-xs text-muted-foreground mt-1" dir="ltr">{sale.patient.phone}</p>}</td>
              <td className="p-4"><span className="rounded-md bg-muted px-2 py-1 text-xs">{{ CASH: 'نقدي', CREDIT: 'آجل', CARD: 'بطاقة' }[sale.payment?.method as string] || sale.payment?.method || '—'}</span></td>
              <td className="p-4 font-semibold whitespace-nowrap tabular-nums">{money(sale.total)} <span className="font-normal text-xs text-muted-foreground">د.ع</span></td>
              <td className="p-4"><span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${sale.syncFailed ? 'text-destructive' : sale.synced ? 'text-emerald-600' : 'text-amber-600'}`}>{sale.syncFailed ? <AlertCircle size={14} /> : sale.synced ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{sale.syncFailed ? 'تعذرت المزامنة' : sale.synced ? 'مكتملة' : 'بانتظار المزامنة'}</span></td>
              <td className="p-4"><button className={btn} disabled={busy || returns} aria-expanded={selected?.id === sale.id} aria-label={'تفاصيل الفاتورة ' + saleLabel(sale)} onClick={() => setSelected(selected?.id === sale.id ? null : sale)}>{selected?.id === sale.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}التفاصيل</button></td>
            </tr>
            {selected?.id === sale.id && <tr><td colSpan={6} className="px-4 pb-5 bg-primary/5"><div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3"><h3 className="font-semibold">أصناف الفاتورة <span className="text-xs text-muted-foreground">({sale.items.length})</span></h3><div className="flex gap-2"><button className={btn} disabled={busy} onClick={print}><Printer size={16} />إعادة الطباعة</button>{data.canReturn && <button className={btn + ' text-destructive'} disabled={busy} onClick={() => setReturns(true)}><Undo2 size={16} />مراجعة الإرجاع</button>}</div></div>
              {sale.syncFailed && <p className="text-sm text-destructive">تعذرت مزامنة هذه الفاتورة؛ راجع المسؤول.</p>}
              <table className="w-full text-sm"><thead className="text-muted-foreground border-b border-border"><tr><th className="text-right py-2">الدواء</th><th>الكمية</th><th>السعر</th><th>المرتجع</th></tr></thead><tbody>{sale.items.map((item: any) => <tr key={item.id} className="border-b border-border/50"><td className="py-3">{item.drug?.tradeName || '—'}</td><td className="text-center">{item.quantity}</td><td className="text-center">{money(item.price)}</td><td className="text-center">{(sale.returns || []).flatMap((r: any) => r.items).filter((r: any) => r.drugId === item.drugId).reduce((sum: number, r: any) => sum + r.quantity, 0)}</td></tr>)}</tbody></table>
            </div></td></tr>}
          </Fragment>)}
          {!busy && !error && data && !data.sales.length && <tr><td colSpan={6} className="py-14 text-center"><ReceiptText size={32} className="mx-auto text-muted-foreground mb-3" /><h3 className="font-semibold">لا توجد فواتير تطابق البحث</h3><p className="text-muted-foreground text-sm mt-2">جرّب فترة أخرى أو ابحث برقم الفاتورة أو بيانات العميل.</p></td></tr>}
        </tbody></table></div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><span className="text-xs text-muted-foreground">الإجماليات تخص الفترة والبحث المحددين، قبل خصم المرتجعات.</span><div className="flex items-center gap-3"><button className={btn} disabled={busy || !data || page === 1} onClick={() => void load(page - 1)}>السابق</button><span className="text-sm">صفحة {page} من {Math.max(1, Math.ceil((data?.total || 0) / 30))}</span><button className={btn} disabled={busy || !data || page * 30 >= data.total} onClick={() => void load(page + 1)}>التالي</button></div></footer>
      </section>
      {selected && (
        <div className="hidden">
          <InvoicePrint
            ref={receipt}
            items={selected.items.map((i: any) => ({
              name: i.drug?.tradeName || "",
              quantity: i.quantity,
              price: i.price,
            }))}
            total={selected.total}
            date={new Date(selected.createdAt)}
            invoiceNumber={saleLabel(selected)}
            patientName={selected.patient?.name}
            settings={settings?.settings || settings}
          />
        </div>
      )}
      {returns && (
        <SaleReturnModal
          isOpen
          user={user}
          initialSale={selected}
          onClose={() => {
            setReturns(false);
            void load(page);
          }}
        />
      )}
    </div>
  );
}
