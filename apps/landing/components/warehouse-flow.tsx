import { Send, ClipboardCheck, BadgeCheck, FileText, PackageCheck } from 'lucide-react';

/*
 * The order lifecycle as the system runs it (warehouse-order-state): sent → under review
 * → quoted → approved (a draft purchase invoice is created with the warehouse as
 * supplier) → shipped / delivered and received into stock.
 */
const steps = [
  { icon: Send, who: 'الصيدلية', title: 'إرسال الطلب', text: 'من «الطلب الذكي» بضغطة، أو باختيار الأصناف من كتالوج المذخر وأسعاره.' },
  { icon: ClipboardCheck, who: 'المذخر', title: 'المراجعة والتسعير', text: 'يحدد لكل صنف: متوفر أو جزئي أو نافد، مع الكمية والسعر النهائي وملاحظة.' },
  { icon: BadgeCheck, who: 'الصيدلية', title: 'اعتماد العرض', text: 'تقارن العرض بما طلبت، ثم تعتمده أو ترفضه — ولكل خطوة أثر في سجل الطلب.' },
  { icon: FileText, who: 'تلقائياً', title: 'فاتورة شراء جاهزة', text: 'يُنشأ عند الاعتماد مسودة فاتورة شراء بالبنود المعتمدة، والمذخر مورّد في حسابك.' },
  { icon: PackageCheck, who: 'الطرفان', title: 'الشحن والاستلام', text: 'تتابع الشحن، ثم تستلم البضاعة إلى المخزون برقم الدفعة وتاريخ الانتهاء.' },
];

export default function WarehouseFlow({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark';
  return (
    <ol className="relative grid gap-4 md:grid-cols-5 md:gap-3">
      {/* connecting line (desktop) */}
      <div
        className={`pointer-events-none absolute start-8 end-[calc(20%-2rem)] top-8 hidden border-t-2 border-dashed md:block ${dark ? 'border-primary-300/35' : 'border-primary-700/25'}`}
        aria-hidden="true"
      />
      {steps.map((s, i) => (
        <li key={s.title} className="relative">
          <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
            <div
              className={`relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                dark ? 'bg-ink-900 text-primary-300 ring-white/15' : 'bg-white text-primary-700 ring-primary-100 shadow-soft'
              }`}
            >
              <s.icon size={26} strokeWidth={1.8} />
              <span className={`absolute -top-2 -start-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${dark ? 'bg-accent text-ink-950' : 'bg-primary-700 text-white'}`}>
                {i + 1}
              </span>
            </div>
            <div className="md:mt-5">
              <span className={`text-xs font-bold ${dark ? 'text-accent' : 'text-primary-600'}`}>{s.who}</span>
              <h3 className={`mt-0.5 text-lg font-extrabold ${dark ? 'text-white' : 'text-slate-900'}`}>{s.title}</h3>
            </div>
          </div>
          <p className={`mt-2 text-sm leading-relaxed md:pe-2 ${dark ? 'text-primary-100/70' : 'text-slate-600'}`}>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
