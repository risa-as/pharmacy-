"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  MessageCircle,
  FileText,
  AlertCircle,
  Clock,
  Banknote,
} from "lucide-react";
import QuickPaymentModal from "./quick-payment-modal";

interface Debtor {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  unpaidSalesCount: number;
  lastSaleDate: Date | string | null;
  oldestUnpaidDate: Date | string | null;
}

interface Safe {
  id: string;
  name: string;
  type: string;
}

function formatIQD(amount: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " د.ع";
}

function debtAgeDays(date: Date | string | null): number | null {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function DebtAgeBadge({ days }: { days: number | null }) {
  if (days === null)
    return <span className="text-muted-foreground text-xs">—</span>;

  if (days > 60) {
    return (
      <span className="inline-flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-2 py-0.5 text-xs font-bold">
        <AlertCircle className="w-3 h-3" />
        منذ {days} يوم
      </span>
    );
  }
  if (days > 30) {
    return (
      <span className="inline-flex items-center gap-1 bg-warning/10 text-warning border border-warning/20 rounded-md px-2 py-0.5 text-xs font-medium">
        <Clock className="w-3 h-3" />
        منذ {days} يوم
      </span>
    );
  }
  return <span className="text-muted-foreground text-xs">منذ {days} يوم</span>;
}

export default function DebtorsTable({
  debtors,
  safes,
}: {
  debtors: Debtor[];
  safes: Safe[];
}) {
  const [query, setQuery] = useState("");
  const [payingDebtor, setPayingDebtor] = useState<Debtor | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.phone || "").includes(q),
    );
  }, [debtors, query]);

  return (
    <>
      {/* Same layout and styling as the batches table; the list is small, so the search filters in place. */}
      <div>
        {/* البحث */}
        <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]" dir="rtl">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو رقم الهاتف..."
              className="w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {query.trim() ? (
              <>
                {filtered.length} نتيجة لـ &quot;<span className="font-bold text-foreground">{query.trim()}</span>&quot;
              </>
            ) : (
              <>{debtors.length} مدين</>
            )}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">لا توجد نتائج للبحث</p>
            <p className="text-sm text-muted-foreground mt-1">جرّب اسماً أو رقماً آخر</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">العميل</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المبلغ المستحق</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">فواتير غير مسددة</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">عمر الدين</th>
                  <th className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filtered.map((debtor) => {
                  const days = debtAgeDays(debtor.oldestUnpaidDate);
                  const phone = debtor.phone || "";
                  const whatsappUrl = phone
                    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(`عزيزي ${debtor.name}، يرجى التواصل معنا لتسديد المبلغ المستحق ${formatIQD(debtor.balance)}. شكراً لتعاملكم.`)}`
                    : null;

                  return (
                    <tr key={debtor.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-3">
                        <div className="max-w-[220px]">
                          <Link
                            href={`/dashboard/debts/${debtor.id}`}
                            className="block font-semibold text-foreground hover:text-primary transition-colors truncate"
                            title={debtor.name}
                          >
                            {debtor.name}
                          </Link>
                          <p className="text-[10px] text-muted-foreground truncate text-right" dir="ltr">
                            {phone || "—"}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-destructive whitespace-nowrap" dir="ltr">
                        {formatIQD(debtor.balance)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                        <span className="font-bold text-foreground">{debtor.unpaidSalesCount}</span> فاتورة
                      </td>
                      <td className="px-3 py-3">
                        <DebtAgeBadge days={days} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* تسديد سريع */}
                          <button
                            onClick={() => setPayingDebtor(debtor)}
                            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-success/10 hover:text-success hover:border-success/50 transition-colors"
                            title="تسديد سريع"
                          >
                            <Banknote className="w-4 h-4" />
                          </button>

                          {/* كشف حساب */}
                          <Link
                            href={`/dashboard/debts/${debtor.id}`}
                            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
                            title="كشف حساب"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>

                          {/* واتساب */}
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/50 transition-colors"
                              title="إرسال تذكير واتساب"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal التسديد السريع */}
      {payingDebtor && (
        <QuickPaymentModal
          patientId={payingDebtor.id}
          patientName={payingDebtor.name}
          balance={payingDebtor.balance}
          safes={safes}
          onClose={() => setPayingDebtor(null)}
        />
      )}
    </>
  );
}
