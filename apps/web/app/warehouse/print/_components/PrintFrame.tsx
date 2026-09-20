'use client';

// إطار مشترك لمستندات الطباعة في بوابة المذاخر (فحص 2026-09-17، فجوة G2:
// لم تكن هناك أي طباعة خارج ملصقات الباركود).
//
// لماذا صفحات تحت /warehouse بدل نوافذ طباعة: قواعد @media print في
// app/globals.css تُخفي أصلاً nav وaside و[class*="sidenav"] وكل <button>
// غير .print-visible — فأي صفحة هنا تُطبَع نظيفة بلا شريط جانبي ولا أزرار،
// بلا أي CSS طباعة جديد. زرّ الطباعة نفسه يختفي في الورقة لهذا السبب.
//
// الزرّ لا يُطلق window.print() تلقائياً عند التحميل عمداً: الفتح للمراجعة
// أشيع من الفتح للطباعة الفورية، والحوار التلقائي يفرض إلغاءً في كل مرة.

import { Printer, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PrintFrame({
    title,
    backHref,
    backLabel,
    children,
}: {
    title: string;
    backHref: string;
    backLabel: string;
    children: React.ReactNode;
}) {
    return (
        <div dir="rtl" className="mx-auto max-w-[820px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <ArrowRight className="h-4 w-4" /> {backLabel}
                </Link>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Printer className="h-4 w-4" /> طباعة {title}
                </button>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
                {children}
            </div>
        </div>
    );
}
