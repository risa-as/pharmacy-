import { useEffect, useRef, useState } from "react";
import { Search, Printer, Undo2, RefreshCw, ReceiptText } from "lucide-react";
import SaleReturnModal from "./SaleReturnModal";
import InvoicePrint from "./InvoicePrint";
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [returns, setReturns] = useState(false),
    [settings, setSettings] = useState<any>(null);
  const generation = useRef(0),
    receipt = useRef<HTMLDivElement>(null);
  async function load(p = 1) {
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (period === "week") start.setDate(start.getDate() - 6);
      const result = await window.ipcRenderer.invoke("staff:sales", {
        page: p,
        search,
        from:
          period === "custom"
            ? from
              ? new Date(from + "T00:00:00").toISOString()
              : undefined
            : period === "all"
              ? undefined
              : start.toISOString(),
        to:
          period === "custom" && to
            ? new Date(to + "T23:59:59.999").toISOString()
            : undefined,
      });
      if (request !== generation.current) return;
      if (!result.success) throw Error(result.error);
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
    void load();
    return () => {
      generation.current++;
    };
  }, [period]);
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
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex gap-2">
            <ReceiptText />
            سجل المبيعات
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            فواتير هذا الجهاز في فرعك، بما فيها غير المزامنة. يتطلب فتح السجل
            التحقق من صلاحيتك عبر الإنترنت.
          </p>
        </div>
        <button className={btn} disabled={busy} onClick={() => void load(page)}>
          <RefreshCw size={16} />
          تحديث
        </button>
      </header>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          className={field + " flex-1 min-w-48"}
          placeholder="رقم الفاتورة، اسم العميل أو هاتفه"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={field}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="today">اليوم</option>
          <option value="week">آخر 7 أيام</option>
          <option value="all">الكل</option>
          <option value="custom">فترة مخصصة</option>
        </select>
        {period === "custom" && (
          <>
            <input
              aria-label="من"
              type="date"
              className={field}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              aria-label="إلى"
              type="date"
              className={field}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        <button className={btn} disabled={busy}>
          <Search size={16} />
          بحث
        </button>
      </form>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy && <p role="status">جارٍ تحميل الفواتير…</p>}
      {data && (
        <>
          <div className="rounded-lg bg-card border border-border p-4 flex gap-8">
            <span>{money(data.total)} فاتورة</span>
            <strong>{money(data.amount)} د.ع</strong>
            <span className="text-muted-foreground text-sm">
              إجمالي الفواتير قبل خصم المرتجعات — للفترة والبحث المحددين
            </span>
          </div>
          <div className="grid gap-3">
            {data.sales.map((sale: any) => (
              <article
                key={sale.id}
                className="bg-card border border-border rounded-lg p-4"
              >
                <button
                  className="w-full flex flex-wrap justify-between gap-3 text-right"
                  onClick={() =>
                    setSelected(selected?.id === sale.id ? null : sale)
                  }
                >
                  <div>
                    <strong dir="ltr">
                      {sale.invoiceNumber || sale.id.slice(0, 8)}
                    </strong>
                    <p className="text-sm text-muted-foreground">
                      {new Date(sale.createdAt).toLocaleString(
                        "ar-IQ-u-nu-latn",
                      )}{" "}
                      · {sale.patient?.name || "بيع مباشر"}
                    </p>
                  </div>
                  <div>
                    <strong>{money(sale.total)} د.ع</strong>
                    <p className="text-xs">
                      {sale.payment?.method === "CREDIT"
                        ? "آجل"
                        : sale.payment?.method === "CASH"
                          ? "نقدي"
                          : sale.payment?.method || "—"}{" "}
                      ·{" "}
                      {sale.syncFailed
                        ? "تعذرت المزامنة — راجع المسؤول"
                        : sale.synced
                          ? "مزامنة مكتملة"
                          : "بانتظار المزامنة"}
                    </p>
                  </div>
                  <span className="text-primary text-sm">
                    {selected?.id === sale.id
                      ? "إخفاء التفاصيل"
                      : "عرض التفاصيل ←"}
                  </span>
                </button>
                {selected?.id === sale.id && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-right p-2">الدواء</th>
                            <th>الكمية</th>
                            <th>السعر</th>
                            <th>المرتجع</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sale.items.map((i: any) => (
                            <tr key={i.id}>
                              <td className="p-2">{i.drug?.tradeName}</td>
                              <td className="text-center">{i.quantity}</td>
                              <td className="text-center">{money(i.price)}</td>
                              <td className="text-center">
                                {sale.returns
                                  .flatMap((r: any) => r.items)
                                  .filter((r: any) => r.drugId === i.drugId)
                                  .reduce(
                                    (s: number, r: any) => s + r.quantity,
                                    0,
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button className={btn} onClick={print}>
                        <Printer size={16} />
                        إعادة الطباعة
                      </button>
                      {data.canReturn && (
                        <button
                          className={btn}
                          onClick={() => setReturns(true)}
                        >
                          <Undo2 size={16} />
                          مراجعة الإرجاع
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!data.sales.length && (
            <div className="py-16 text-center text-muted-foreground">
              <ReceiptText className="mx-auto mb-3" />
              لا توجد فواتير تطابق البحث
            </div>
          )}
          <div className="flex gap-3 items-center">
            <button
              className={btn}
              disabled={busy || page === 1}
              onClick={() => void load(page - 1)}
            >
              السابق
            </button>
            <span>
              صفحة {page} من {Math.max(1, Math.ceil(data.total / 30))}
            </span>
            <button
              className={btn}
              disabled={busy || page * 30 >= data.total}
              onClick={() => void load(page + 1)}
            >
              التالي
            </button>
          </div>
        </>
      )}
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
            invoiceNumber={String(
              selected.invoiceNumber || selected.id.slice(0, 8),
            )}
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
