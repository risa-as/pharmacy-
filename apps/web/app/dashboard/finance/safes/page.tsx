import Link from "next/link";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import { getCashDrawerLedger } from "@/app/lib/cash-drawer";

export const dynamic = "force-dynamic";
const money = (value: number) =>
  `${value.toLocaleString("ar-IQ-u-nu-latn")} د.ع`;
const kinds: Record<string, string> = {
  SALE: "بيع",
  SALE_RETURN: "مرتجع",
  EXPENSE: "مصروف",
  CUSTOMER_RECEIPT: "تحصيل دين",
  SUPPLIER_PAYMENT: "دفعة مورد",
  SHIFT_CASH_DROP: "حركة وردية",
  VOUCHER: "سند",
  TRANSFER: "تحويل",
};

export default async function CashDrawerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const branch = typeof params.branch === "string" ? params.branch : undefined;
  const data = await getCashDrawerLedger(branch, Number(params.page ?? 1));
  const pageUrl = (page: number) =>
    `/dashboard/finance/safes?${new URLSearchParams({ branch: data.selected?.id ?? "", page: String(page) })}`;
  return (
    <main dir="rtl" className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Wallet className="text-primary" />
            الصندوق
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            رصيد الصندوق وحركاته المسجلة في الموقع. هذا الرصيد ليس صافي الربح أو
            جرد النقد الفعلي.
          </p>
        </div>
        {data.branches.length > 1 && (
          <form className="flex gap-2">
            <label htmlFor="cash-branch" className="sr-only">
              الفرع
            </label>
            <select
              id="cash-branch"
              name="branch"
              defaultValue={data.selected?.id}
              className="rounded-lg border bg-background p-2"
            >
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
              عرض
            </button>
          </form>
        )}
      </header>
      {data.state !== "ready" ? (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-bold">
            {data.state === "ambiguous"
              ? "يلزم مراجعة ربط الصندوق"
              : "لا يوجد صندوق مسجّل لهذا الفرع"}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {data.state === "ambiguous"
              ? "يوجد أكثر من صندوق نقدي لهذا الفرع. تواصل مع المسؤول لتحديد صندوق العمل قبل عرض الحركات."
              : "يظهر الصندوق بعد إعداده ومزامنة العمليات. لم يتم إنشاء صندوق جديد تلقائياً."}
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-muted-foreground">
                الرصيد المسجّل — {data.selected.name}
              </p>
              <p className="mt-3 text-3xl font-bold text-primary">
                {money(data.safe.balance)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {data.safe.name}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="flex items-center gap-2 text-muted-foreground">
                <ArrowDownLeft size={18} />
                مجموع المقبوضات المسجّلة
              </p>
              <p className="mt-3 text-2xl font-bold">{money(data.incoming)}</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="flex items-center gap-2 text-muted-foreground">
                <ArrowUpRight size={18} />
                مجموع المدفوعات المسجّلة
              </p>
              <p className="mt-3 text-2xl font-bold">{money(data.outgoing)}</p>
            </div>
          </section>
          <aside className="rounded-xl border bg-muted/30 p-4 text-sm space-y-2">
            <p>
              الأرصدة والمجاميع تخص كامل السجل السحابي. العمليات الموجودة على
              الجهاز ولم تصل بعد لا تدخل في هذه المجاميع؛ راجع حالة المزامنة في
              تطبيق سطح المكتب.
            </p>
            {data.unlinked > 0 && (
              <p className="flex gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={18} />
                {data.unlinked} حركة بيع أو مرتجع مسجّلة دون مرجع مستند، وتحتاج
                مطابقة قبل إعادة تسجيل أي مبلغ.
              </p>
            )}
            {Math.abs(data.safe.balance - (data.incoming - data.outgoing)) >
              0.01 && (
              <p className="text-destructive">
                الرصيد المسجّل يختلف عن صافي الحركات؛ يلزم مراجعة السجل مع
                المسؤول.
              </p>
            )}
          </aside>
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b p-4">
              <h2 className="font-bold">حركات الصندوق</h2>
              <p className="text-sm text-muted-foreground">
                {data.count.toLocaleString()} حركة · الأحدث أولاً
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-muted/40">
                  <tr>
                    {[
                      "التاريخ",
                      "العملية",
                      "داخل",
                      "خارج",
                      "مرجع المستند",
                      "البيان",
                    ].map((x) => (
                      <th key={x} className="p-3 whitespace-nowrap">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-3 whitespace-nowrap">
                        {row.createdAt.toLocaleString("ar-IQ", {
                          timeZone: "Asia/Baghdad",
                        })}
                      </td>
                      <td className="p-3">
                        {kinds[row.referenceType] ?? row.referenceType}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {row.type === "IN" ? money(row.amount) : "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {row.type === "OUT" ? money(row.amount) : "—"}
                      </td>
                      <td className="p-3">
                        <span dir="ltr" title={row.referenceId ?? undefined}>
                          {row.referenceId
                            ? row.referenceId.slice(0, 12)
                            : "غير مربوط"}
                        </span>
                      </td>
                      <td className="p-3 min-w-48">{row.description || "—"}</td>
                    </tr>
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-8 text-center text-muted-foreground"
                      >
                        لا توجد حركات مسجّلة بعد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="صفحات حركات الصندوق"
              className="flex items-center justify-between border-t p-4"
            >
              {data.page > 1 ? (
                <Link href={pageUrl(data.page - 1)} className="text-primary">
                  السابق
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                صفحة {data.page} من {data.pages}
              </span>
              {data.page < data.pages ? (
                <Link href={pageUrl(data.page + 1)} className="text-primary">
                  التالي
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
