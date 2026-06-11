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
      <div>
        {/* البحث */}
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو رقم الهاتف..."
              className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <p className="text-sm">لا توجد نتائج مطابقة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    العميل
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الهاتف
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبلغ المستحق
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    فواتير غير مسددة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    عمر الدين
                  </th>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo">
                    الإجراءات
                  </th>
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
                    <tr
                      key={debtor.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/debts/${debtor.id}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {debtor.name}
                        </Link>
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground text-right"
                        dir="ltr"
                      >
                        {phone || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-1.5 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-1">
                          <span className="font-bold text-sm" dir="ltr">
                            {formatIQD(debtor.balance)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                          {debtor.unpaidSalesCount} فاتورة
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <DebtAgeBadge days={days} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* تسديد سريع */}
                          <button
                            onClick={() => setPayingDebtor(debtor)}
                            className="rounded-lg border border-border p-2 hover:bg-success/10 hover:border-success/50 transition-colors"
                            title="تسديد سريع"
                          >
                            <Banknote className="w-4 h-4 text-success" />
                          </button>

                          {/* كشف حساب */}
                          <Link
                            href={`/dashboard/debts/${debtor.id}`}
                            className="rounded-lg border border-border p-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                            title="كشف حساب"
                          >
                            <FileText className="w-4 h-4 text-primary" />
                          </Link>

                          {/* واتساب */}
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-border p-2 hover:bg-green-500/10 hover:border-green-500/50 transition-colors"
                              title="إرسال تذكير واتساب"
                            >
                              <MessageCircle className="w-4 h-4 text-green-500" />
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
