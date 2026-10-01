import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Store,
  Wallet,
} from "lucide-react";
import { cleanCashFilter, getCashDrawerLedger } from "@/app/lib/cash-drawer";
import StatCard from "@/app/ui/dashboard/stat-card";

export const dynamic = "force-dynamic";

const num = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const money = (value: number) => `${num(value)} د.ع`;

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
const kindTone: Record<string, string> = {
  SALE: "bg-primary/10 text-primary",
  SALE_RETURN: "bg-warning/10 text-warning",
  EXPENSE: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CUSTOMER_RECEIPT: "bg-success/10 text-success",
  SUPPLIER_PAYMENT: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  SHIFT_CASH_DROP: "bg-info/10 text-info",
  VOUCHER: "bg-muted text-muted-foreground",
  TRANSFER: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
};

const dateFmt = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Baghdad",
});
const timeFmt = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Baghdad",
});

export default async function CashDrawerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const branch = typeof params.branch === "string" ? params.branch : undefined;
  const filter = cleanCashFilter({ direction: params.direction, kind: params.kind });
  const data = await getCashDrawerLedger(branch, Number(params.page ?? 1), filter);

  /** Keeps branch and filters; any change other than the page goes back to page 1. */
  const url = (next: { branch?: string; direction?: string; kind?: string; page?: number }) => {
    const q = new URLSearchParams();
    const b = next.branch ?? data.selected?.id;
    if (b) q.set("branch", b);
    const direction = "direction" in next ? next.direction : filter.direction;
    const kind = "kind" in next ? next.kind : filter.kind;
    if (direction) q.set("direction", direction);
    if (kind) q.set("kind", kind);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    return `/dashboard/finance/safes?${q}`;
  };
  const chip = (active: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <main dir="rtl" className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الصندوق</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            رصيد صندوق النقد في الفرع وكل حركة دخلت إليه أو خرجت منه.
          </p>
        </div>
        {data.branches.length > 1 && (
          <nav aria-label="الفرع" className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
            {data.branches.map((b) => (
              <Link
                key={b.id}
                href={url({ branch: b.id, direction: undefined, kind: undefined })}
                aria-current={b.id === data.selected?.id ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  b.id === data.selected?.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Store className="h-3.5 w-3.5" />
                {b.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {data.state !== "ready" ? (
        <section className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            {data.state === "ambiguous" ? <AlertTriangle className="h-6 w-6 text-warning" /> : <Wallet className="h-6 w-6" />}
          </span>
          <h2 className="mt-4 font-bold text-foreground">
            {data.state === "ambiguous" ? "يلزم مراجعة ربط الصندوق" : "لا يوجد صندوق مسجّل لهذا الفرع"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {data.state === "ambiguous"
              ? "يوجد أكثر من صندوق نقدي لهذا الفرع. تواصل مع المسؤول لتحديد صندوق العمل قبل عرض الحركات."
              : "يظهر الصندوق بعد إعداده ومزامنة العمليات. لم يتم إنشاء صندوق جديد تلقائياً."}
          </p>
        </section>
      ) : (
        (() => {
          const net = data.incoming - data.outgoing;
          const matches = Math.abs(data.safe.balance - net) <= 0.01;
          const maxKind = Math.max(1, ...data.byKind.map((k) => Math.max(k.incoming, k.outgoing)));
          const from = data.count ? (data.page - 1) * 50 + 1 : 0;
          const to = Math.min(data.count, data.page * 50);
          const filtered = Boolean(filter.direction || filter.kind);
          return (
            <>
              {/* Balance + today */}
              <section className="grid gap-4 lg:grid-cols-3">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 lg:row-span-2">
                  <span className="absolute inset-y-0 start-0 w-1 bg-primary" aria-hidden="true" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">الرصيد المسجّل</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">{data.safe.name} · {data.selected.name}</p>
                    </div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Wallet className="h-5 w-5" />
                    </span>
                  </div>
                  <p className={`mt-6 text-4xl font-bold tabular-nums ${data.safe.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                    {num(data.safe.balance)}
                    <span className="ms-2 text-base font-normal text-muted-foreground">د.ع</span>
                  </p>
                  <div className="mt-6 space-y-2 border-t border-border/60 pt-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">آخر حركة</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {data.lastMovementAt ? `${dateFmt.format(data.lastMovementAt)} · ${timeFmt.format(data.lastMovementAt)}` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">مطابقة السجل</span>
                      {matches ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> مطابق لصافي الحركات
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> يختلف بـ {money(Math.abs(data.safe.balance - net))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <StatCard
                  label="مقبوضات اليوم" value={num(data.today.incoming)} unit="د.ع" icon={ArrowDownLeft} tone="success" bar
                  footer={<span className="text-xs text-muted-foreground">{num(data.today.inCount)} حركة داخلة</span>}
                />
                <StatCard
                  label="مدفوعات اليوم" value={num(data.today.outgoing)} unit="د.ع" icon={ArrowUpRight} tone="destructive" bar
                  footer={<span className="text-xs text-muted-foreground">{num(data.today.outCount)} حركة خارجة</span>}
                />
                <StatCard
                  label="مجموع المقبوضات" value={num(data.incoming)} unit="د.ع" icon={ArrowDownLeft} tone="muted"
                  footer={<span className="text-xs text-muted-foreground">كل الحركات المسجّلة</span>}
                />
                <StatCard
                  label="مجموع المدفوعات" value={num(data.outgoing)} unit="د.ع" icon={ArrowUpRight} tone="muted"
                  footer={<span className="text-xs text-muted-foreground">صافي الحركات {money(net)}</span>}
                />
              </section>

              {/* Warnings that need someone to act */}
              {(data.unlinked > 0 || !matches) && (
                <section className="space-y-2">
                  {!matches && (
                    <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                      <p className="text-foreground">
                        <span className="font-bold">الرصيد المسجّل يختلف عن صافي الحركات.</span>{" "}
                        <span className="text-muted-foreground">يلزم مراجعة السجل مع المسؤول.</span>
                      </p>
                    </div>
                  )}
                  {data.unlinked > 0 && (
                    <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                      <p className="text-foreground">
                        <span className="font-bold">{num(data.unlinked)} حركة بيع أو مرتجع بلا ربط بالمستند الأصلي.</span>{" "}
                        <span className="text-muted-foreground">
                          مبالغها محتسبة في المجاميع؛ الناقص هو المرجع فقط، وليست عمليات معلّقة أو فاشلة المزامنة. يلزم مطابقة المراجع، ولا تُعد تسجيل مبالغها.
                        </span>
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Breakdown by operation + ledger */}
              <section className="grid gap-4 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-5 xl:col-span-1">
                  <h2 className="text-sm font-bold text-foreground">حسب نوع العملية</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">اضغط نوعاً لعرض حركاته فقط</p>
                  {data.byKind.length ? (
                    <div className="mt-4 space-y-4">
                      {data.byKind.map((k) => (
                        <Link
                          key={k.kind}
                          href={url({ kind: filter.kind === k.kind ? undefined : k.kind, direction: undefined })}
                          className={`block rounded-lg p-2 -m-2 transition-colors hover:bg-muted/60 ${filter.kind === k.kind ? "bg-muted" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-semibold text-foreground">{kinds[k.kind] ?? k.kind}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{num(k.count)} حركة</span>
                          </div>
                          {k.incoming > 0 && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-success" style={{ width: `${Math.max(3, (k.incoming / maxKind) * 100)}%` }} />
                              </div>
                              <span className="w-28 shrink-0 text-end text-xs font-semibold text-success tabular-nums">+{num(k.incoming)}</span>
                            </div>
                          )}
                          {k.outgoing > 0 && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.max(3, (k.outgoing / maxKind) * 100)}%` }} />
                              </div>
                              <span className="w-28 shrink-0 text-end text-xs font-semibold text-destructive tabular-nums">−{num(k.outgoing)}</span>
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 text-center text-sm text-muted-foreground">لا توجد حركات بعد</p>
                  )}
                </div>

                <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card xl:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">حركات الصندوق</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {num(data.count)} حركة{filtered ? " مطابقة" : ""} · الأحدث أولاً
                        {filter.kind && <> · النوع: <span className="font-semibold text-foreground">{kinds[filter.kind]}</span></>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={url({ direction: undefined })} className={chip(!filter.direction)}>الكل</Link>
                      <Link href={url({ direction: "IN" })} className={chip(filter.direction === "IN")}>
                        <ArrowDownLeft className="h-3.5 w-3.5" /> مقبوضات
                      </Link>
                      <Link href={url({ direction: "OUT" })} className={chip(filter.direction === "OUT")}>
                        <ArrowUpRight className="h-3.5 w-3.5" /> مدفوعات
                      </Link>
                      {filtered && (
                        <Link href={url({ direction: undefined, kind: undefined })} className="ms-1 text-xs font-semibold text-primary hover:underline">
                          مسح التصفية
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-5 py-2.5 text-start font-semibold">التاريخ</th>
                          <th className="py-2.5 text-start font-semibold">العملية</th>
                          <th className="py-2.5 text-start font-semibold">البيان</th>
                          <th className="py-2.5 text-start font-semibold">المرجع</th>
                          <th className="px-5 py-2.5 text-end font-semibold">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.rows.map((row) => {
                          const incoming = row.type === "IN";
                          return (
                            <tr key={row.id} className="transition-colors hover:bg-muted/40">
                              <td className="whitespace-nowrap px-5 py-3">
                                <div className="font-medium text-foreground tabular-nums">{dateFmt.format(row.createdAt)}</div>
                                <div className="text-xs text-muted-foreground tabular-nums">{timeFmt.format(row.createdAt)}</div>
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${kindTone[row.referenceType] ?? "bg-muted text-muted-foreground"}`}>
                                  {kinds[row.referenceType] ?? row.referenceType}
                                </span>
                              </td>
                              <td className="max-w-72 py-3 pe-4 text-foreground">
                                <span className="line-clamp-2">{row.description || "—"}</span>
                              </td>
                              <td className="py-3">
                                {row.referenceId ? (
                                  <span dir="ltr" title={row.referenceId} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                    {row.referenceId.slice(0, 12)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-warning">غير مربوط</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-5 py-3 text-end">
                                <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${incoming ? "text-success" : "text-destructive"}`}>
                                  {incoming ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                                  {incoming ? "+" : "−"}{num(row.amount)}
                                </span>
                                <span className="ms-1 text-xs text-muted-foreground">د.ع</span>
                              </td>
                            </tr>
                          );
                        })}
                        {!data.rows.length && (
                          <tr>
                            <td colSpan={5} className="px-5 py-14 text-center">
                              <p className="font-semibold text-foreground">{filtered ? "لا توجد حركات بهذه التصفية" : "لا توجد حركات مسجّلة بعد"}</p>
                              {filtered && (
                                <Link href={url({ direction: undefined, kind: undefined })} className="mt-1 inline-block text-sm font-semibold text-primary hover:underline">
                                  عرض كل الحركات
                                </Link>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <nav aria-label="صفحات حركات الصندوق" className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {data.count ? `${num(from)}–${num(to)} من ${num(data.count)}` : "—"}
                    </span>
                    <div className="flex items-center gap-1">
                      {data.page > 1 ? (
                        <Link href={url({ page: data.page - 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">
                          <ChevronRight className="h-3.5 w-3.5" /> السابق
                        </Link>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground/50">
                          <ChevronRight className="h-3.5 w-3.5" /> السابق
                        </span>
                      )}
                      <span className="px-2 text-xs text-muted-foreground tabular-nums">{data.page} / {data.pages}</span>
                      {data.page < data.pages ? (
                        <Link href={url({ page: data.page + 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">
                          التالي <ChevronLeft className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground/50">
                          التالي <ChevronLeft className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </nav>
                </div>
              </section>

              {/* What these numbers are (and are not) */}
              <details className="group rounded-xl border border-border bg-card px-5 py-3 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-muted-foreground">
                  <Info className="h-4 w-4" /> عن أرقام هذه الصفحة
                </summary>
                <ul className="mt-3 list-disc space-y-1.5 ps-5 text-muted-foreground">
                  <li>هذا الرصيد هو المسجّل في النظام، وليس صافي الربح ولا جرد النقد الفعلي في الدرج.</li>
                  <li>الأرصدة والمجاميع تشمل كامل الحركات المسجّلة في الموقع، والتصفية تغيّر الجدول فقط.</li>
                  <li>حالة مزامنة العمليات من الجهاز تُعرض في تطبيق سطح المكتب، ولا تُستنتج من تنبيه ربط المستندات.</li>
                </ul>
              </details>
            </>
          );
        })()
      )}
    </main>
  );
}
