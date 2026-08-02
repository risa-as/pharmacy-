/**
 * SalesPrintSheet — the sheet that actually comes out of "طباعة / PDF" on the
 * sales report.
 *
 * The on-screen report is charts and stat cards, which make a poor PDF. This
 * renders one row per sold item instead, so a day's sales print as a plain
 * itemised table. It is `hidden` on screen and `print:block` on paper, while
 * the interactive report is `print:hidden` — so both can live on one page
 * without a second round trip to the server.
 *
 * Line rows repeat their invoice number: an invoice with three drugs prints as
 * three rows carrying the same number, which is what a pharmacist reconciling
 * against the till expects to see.
 */

export interface SalesPrintRow {
  invoice: string;
  drug: string;
  price: number;
  quantity: number;
  total: number;
  branch: string;
  date: string;
  time: string;
}

export default function SalesPrintSheet({
  rows,
  from,
  to,
  branchName,
  invoiceCount,
  netTotal,
}: {
  rows: SalesPrintRow[];
  from: string;
  to: string;
  branchName: string;
  invoiceCount: number;
  /** sum of Sale.total — already net of invoice-level discounts */
  netTotal: number;
}) {
  /**
   * On a single-day report the date is already in the header, so the last
   * column carries only the time. Over a week or a month a bare time is
   * ambiguous, so the column becomes "التاريخ والوقت" and shows both.
   */
  const multiDay = from !== to;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  const unitsSold = rows.reduce((s, r) => s + r.quantity, 0);
  /**
   * The line rows sum to the gross value of what left the shelves. Sale.total
   * is already net of invoice-level discounts, so the two differ whenever a
   * discount was given. Both are shown — a footer that disagreed with its own
   * column would look like a bug in the report.
   */
  const itemsTotal = rows.reduce((s, r) => s + r.total, 0);
  const discount = itemsTotal - netTotal;

  return (
    <div className="hidden print:block text-black" dir="rtl">
      {/* Header */}
      <div className="border-b-2 border-black pb-2 mb-3">
        <h1 className="text-xl font-bold">تقرير المبيعات التفصيلي</h1>
        <div className="flex justify-between text-[11px] mt-1">
          <span>
            الفترة: <span className="font-bold">{from}</span>
            {to !== from && (
              <>
                {" "}إلى <span className="font-bold">{to}</span>
              </>
            )}
          </span>
          <span>الفرع: <span className="font-bold">{branchName}</span></span>
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mb-3">
        <span>عدد الفواتير: <span className="font-bold">{invoiceCount}</span></span>
        <span>عدد الأصناف المباعة: <span className="font-bold">{rows.length}</span></span>
        <span>مجموع الوحدات: <span className="font-bold">{unitsSold}</span></span>
        <span>مجموع الأصناف: <span className="font-bold">{fmt(itemsTotal)} د.ع</span></span>
        {discount !== 0 && (
          <span>الخصم: <span className="font-bold">{fmt(discount)} د.ع</span></span>
        )}
        <span>صافي المبيعات: <span className="font-bold">{fmt(netTotal)} د.ع</span></span>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-[12px] py-8">لا توجد مبيعات في هذه الفترة</p>
      ) : (
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-[#eee]">
              <th className="border border-black/40 px-2 py-1 text-center w-8">#</th>
              <th className="border border-black/40 px-2 py-1 text-right">رقم الفاتورة</th>
              <th className="border border-black/40 px-2 py-1 text-right">اسم الدواء</th>
              <th className="border border-black/40 px-2 py-1 text-center">سعر الدواء</th>
              <th className="border border-black/40 px-2 py-1 text-center">الكمية</th>
              <th className="border border-black/40 px-2 py-1 text-center">السعر الكلي</th>
              <th className={`border border-black/40 px-2 py-1 text-center ${multiDay ? "w-28" : ""}`}>
                {multiDay ? "التاريخ والوقت" : "الوقت"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // a thin rule wherever the invoice changes, so multi-item
              // invoices read as one block
              const newInvoice = i > 0 && rows[i - 1].invoice !== r.invoice;
              return (
                <tr
                  key={`${r.invoice}-${i}`}
                  className={newInvoice ? "border-t-2 border-t-black/50" : ""}
                >
                  <td className="border border-black/40 px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-black/40 px-2 py-1 font-mono">{r.invoice}</td>
                  <td className="border border-black/40 px-2 py-1">{r.drug}</td>
                  <td className="border border-black/40 px-2 py-1 text-center tabular-nums">{fmt(r.price)}</td>
                  <td className="border border-black/40 px-2 py-1 text-center tabular-nums">{r.quantity}</td>
                  <td className="border border-black/40 px-2 py-1 text-center tabular-nums font-bold">{fmt(r.total)}</td>
                  <td className="border border-black/40 px-2 py-1 text-center tabular-nums whitespace-nowrap">
                    {multiDay ? `${r.date} ${r.time}` : r.time}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#eee] font-bold">
              <td className="border border-black/40 px-2 py-1 text-center" colSpan={4}>
                مجموع الأصناف
              </td>
              <td className="border border-black/40 px-2 py-1 text-center tabular-nums">{unitsSold}</td>
              <td className="border border-black/40 px-2 py-1 text-center tabular-nums">{fmt(itemsTotal)}</td>
              <td className="border border-black/40 px-2 py-1" />
            </tr>
            {discount !== 0 && (
              <>
                <tr>
                  <td className="border border-black/40 px-2 py-1 text-center" colSpan={5}>
                    الخصم
                  </td>
                  <td className="border border-black/40 px-2 py-1 text-center tabular-nums">
                    −{fmt(discount)}
                  </td>
                  <td className="border border-black/40 px-2 py-1" />
                </tr>
                <tr className="bg-[#eee] font-bold">
                  <td className="border border-black/40 px-2 py-1 text-center" colSpan={5}>
                    صافي المبيعات
                  </td>
                  <td className="border border-black/40 px-2 py-1 text-center tabular-nums">
                    {fmt(netTotal)}
                  </td>
                  <td className="border border-black/40 px-2 py-1" />
                </tr>
              </>
            )}
          </tfoot>
        </table>
      )}
    </div>
  );
}
