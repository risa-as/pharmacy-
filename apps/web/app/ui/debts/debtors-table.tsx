"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, MessageCircle } from "lucide-react";

interface Debtor {
    id: string;
    name: string;
    phone: string | null;
    balance: number;
    unpaidSalesCount: number;
    lastSaleDate: Date | string | null;
    oldestUnpaidDate: Date | string | null;
}

function formatIQD(amount: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " د.ع";
}

function debtAgeDays(date: Date | string | null): number | null {
    if (!date) return null;
    const ms = Date.now() - new Date(date).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function DebtAgeLabel({ days }: { days: number | null }) {
    if (days === null) return <span className="text-muted-foreground">—</span>;
    let colorClass = "text-success";
    if (days > 60) colorClass = "text-destructive font-bold";
    else if (days > 30) colorClass = "text-warning";
    return <span className={colorClass}>منذ {days} يوم</span>;
}

export default function DebtorsTable({ debtors }: { debtors: Debtor[] }) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return debtors;
        return debtors.filter(
            (d: any) =>
                d.name.toLowerCase().includes(q) ||
                (d.phone || "").includes(q)
        );
    }, [debtors, query]);

    return (
        <div>
            {/* Search */}
            <div className="p-4 border-b border-border">
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="بحث بالاسم أو رقم الهاتف..."
                        className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                    <p className="text-sm">لا توجد نتائج مطابقة</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/80 text-muted-foreground text-xs">
                            <tr>
                                <th className="p-3 text-right font-medium">الاسم</th>
                                <th className="p-3 text-right font-medium">الهاتف</th>
                                <th className="p-3 text-right font-medium">المبلغ المستحق</th>
                                <th className="p-3 text-right font-medium">فواتير غير مسددة</th>
                                <th className="p-3 text-right font-medium">عمر الدين</th>
                                <th className="p-3 text-center font-medium">إجراء</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filtered.map((debtor: any) => {
                                const days = debtAgeDays(debtor.oldestUnpaidDate);
                                const phone = debtor.phone || "";
                                const whatsappUrl = phone
                                    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(`عزيزي ${debtor.name}، يرجى التواصل معنا لتسديد المبلغ المستحق ${formatIQD(debtor.balance)}. شكراً لتعاملكم.`)}`
                                    : null;

                                return (
                                    <tr key={debtor.id} className="hover:bg-accent transition-colors">
                                        <td className="p-3 font-medium text-foreground">{debtor.name}</td>
                                        <td className="p-3 text-muted-foreground" dir="ltr">{phone || "—"}</td>
                                        <td className="p-3">
                                            <span className="text-destructive font-bold">{formatIQD(debtor.balance)}</span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{debtor.unpaidSalesCount}</td>
                                        <td className="p-3">
                                            <DebtAgeLabel days={days} />
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <Link
                                                    href={`/dashboard/debts/${debtor.id}`}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                                                >
                                                    كشف حساب
                                                </Link>
                                                {whatsappUrl && (
                                                    <a
                                                        href={whatsappUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors"
                                                        title="إرسال تذكير واتساب"
                                                    >
                                                        <MessageCircle className="w-3.5 h-3.5" />
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
    );
}
