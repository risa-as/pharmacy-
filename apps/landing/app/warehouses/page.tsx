import type { Metadata } from 'next';
import {
  Store, Warehouse, ScanBarcode, FileSpreadsheet, ClipboardCheck, Boxes, Users, UserRound,
  Gift, Undo2, Receipt, BarChart3, Tag, ShieldCheck, Sparkles, Bell, FileText, CheckCircle2,
} from 'lucide-react';

import SectionHeading from '../../components/section-heading';
import CTAButton from '../../components/cta-button';
import WarehouseFlow from '../../components/warehouse-flow';
import { WarehouseQuoteMockup } from '../../components/mockups';

export const metadata: Metadata = {
  title: 'شبكة المذاخر | فاراماس',
  description:
    'اربط صيدليتك بالمذاخر: كتالوج وأسعار، طلب من الاقتراح الذكي، تسعير كل صنف من بوابة المذخر، واعتماد العرض الذي ينشئ فاتورة الشراء تلقائياً.',
  openGraph: {
    title: 'شبكة المذاخر في فاراماس',
    description: 'من نقص في الرف إلى فاتورة شراء، دون مكالمة واحدة.',
  },
};

const forPharmacy = [
  { icon: Store, title: 'دليل المذاخر', text: 'تصفح المذاخر على المنصة وكتالوج كل منها بأسعاره وتوفره.' },
  { icon: Sparkles, title: 'من الاقتراح إلى الطلب', text: 'حوّل «الطلب الذكي» إلى طلب لمذخر بضغطة، مع استبعاد ما ليس متوفراً عنده.' },
  { icon: Bell, title: 'متابعة كل طلب', text: 'حالة الطلب وسجله الكامل: متى أُرسل، ومن راجعه، وما الذي تغير في العرض.' },
  { icon: FileText, title: 'فاتورة جاهزة', text: 'اعتماد العرض ينشئ مسودة فاتورة شراء بالبنود والأسعار المعتمدة، والمذخر مورّد في حسابك.' },
];

const portal = [
  { icon: ScanBarcode, title: 'كتالوج بالباركود', text: 'أضف الأصناف بالباركود لتطابق أدوية الصيدليات، وحدد السعر والتوفر لكل صنف.' },
  { icon: FileSpreadsheet, title: 'استيراد من Excel', text: 'قالب جاهز وتقرير مطابقة يوضح الجديد والمحدث والمرفوض مع سبب كل صف.' },
  { icon: ClipboardCheck, title: 'صندوق الطلبات والتسعير', text: 'راجع كل طلب وحدد لكل صنف: متوفر أو جزئي أو نافد، بالكمية والسعر النهائي.' },
  { icon: Boxes, title: 'مخزون بالدفعات', text: 'رصيد كل صنف بدفعاته وتواريخ انتهائها، وحركة المشتريات والمبيعات.' },
  { icon: Users, title: 'العملاء وكشوف الحساب', text: 'حساب لكل صيدلية برصيدها وكشف حركاتها، وشروط التعامل التجاري المتفق عليها.' },
  { icon: UserRound, title: 'المندوبون', text: 'نظّم مندوبيك وربطهم بالعملاء والطلبات.' },
  { icon: Gift, title: 'البونص', text: 'بونص بضاعة حقيقي يُحسب في المخزون والفاتورة بدقة.' },
  { icon: Undo2, title: 'المرتجعات والتسوية', text: 'استقبل المرتجعات وسوّها بإشعار دائن موثق ومرقّم.' },
  { icon: Receipt, title: 'السندات', text: 'سندات القبض والصرف مرتبطة بحساب العميل ومرقمة.' },
  { icon: BarChart3, title: 'التقارير', text: 'المبيعات والتحصيل والأصناف والعملاء في تقارير واضحة.' },
  { icon: Tag, title: 'طباعة الملصقات', text: 'ملصقات الأصناف والطلبات جاهزة للطباعة.' },
  { icon: ShieldCheck, title: 'فريق بأدوار', text: 'مالك وموظفون بأدوار: مدير، مبيعات، مخزون، محاسب — كل منهم يرى ما يخصه.' },
];

export default function WarehousesPage() {
  return (
    <main className="flex-grow">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="absolute inset-0 bg-grid-dark mask-fade-b" aria-hidden="true" />
        <div className="absolute -top-40 start-1/3 h-[480px] w-[760px] rounded-full bg-primary-600/25 blur-[120px]" aria-hidden="true" />
        <div className="container relative pt-32 pb-20 lg:pt-40 lg:pb-28">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div className="animate-fade-in-up">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 ps-2 pe-4 text-sm font-bold text-primary-100 ring-1 ring-white/15">
                <Warehouse size={16} className="text-accent" />
                شبكة المذاخر في فاراماس
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[1.3] tracking-tight sm:text-5xl lg:text-6xl">
                الصيدلية والمذخر
                <span className="mt-2 block text-gradient-warm">على طاولة واحدة</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-100/80 md:text-xl">
                طلبات واضحة بدل المكالمات والصور، وتسعير لكل صنف بدل «متوفر تقريباً»، وفاتورة شراء تُنشأ عند الاعتماد بدل إدخالها
                يدوياً.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <CTAButton href="/contact" variant="accent" size="lg" icon>
                  انضم كمذخر
                </CTAButton>
                <CTAButton href="/contact" variant="glass" size="lg">
                  فعّل الطلب من المذاخر لصيدليتك
                </CTAButton>
              </div>
            </div>
            <WarehouseQuoteMockup className="animate-fade-in-up [animation-delay:150ms]" />
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="bg-white py-24">
        <div className="container">
          <SectionHeading
            badge="رحلة الطلب"
            title="خمس خطوات، وكل خطوة لها أثر"
            subtitle="كل طلب يمر بحالات محددة، ولا ينتقل من حالة إلى أخرى إلا بفعل صاحب الحق فيها — ويُسجل كل ذلك في سجل الطلب."
          />
          <WarehouseFlow tone="light" />
        </div>
      </section>

      {/* Two sides */}
      <section className="bg-slate-50 py-24">
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-8 ring-1 ring-slate-200/80 shadow-soft md:p-10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-700 text-white"><Store size={24} /></div>
                <div>
                  <p className="text-sm font-bold text-primary-600">للصيدلية</p>
                  <h2 className="text-2xl font-black text-slate-900">اطلب بثقة، واستلم بلا إعادة إدخال</h2>
                </div>
              </div>
              <ul className="mt-8 space-y-6">
                {forPharmacy.map((f) => (
                  <li key={f.title} className="flex gap-4">
                    <f.icon className="mt-1 shrink-0 text-primary-700" size={22} />
                    <div>
                      <h3 className="font-extrabold text-slate-900">{f.title}</h3>
                      <p className="mt-1 leading-relaxed text-slate-600">{f.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-ink-950 p-8 text-white md:p-10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-ink-950"><Warehouse size={24} /></div>
                <div>
                  <p className="text-sm font-bold text-accent">للمذخر</p>
                  <h2 className="text-2xl font-black">طلبات منظمة من صيدليات جاهزة للشراء</h2>
                </div>
              </div>
              <ul className="mt-8 space-y-4">
                {[
                  'الطلبات تصلك مرتبة بالأصناف والكميات المطلوبة',
                  'تسعّر كل صنف وتحدد المتوفر والجزئي والنافد',
                  'الصيدلية تعتمد أو ترفض، والسجل يوضح كل خطوة',
                  'حسابات العملاء والسندات والمرتجعات في المكان نفسه',
                  'فريقك يعمل بأدوار وصلاحيات منفصلة',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-primary-100/85">
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-primary-300" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Portal capabilities */}
      <section className="bg-white py-24">
        <div className="container">
          <SectionHeading
            badge="بوابة المذخر"
            title="كل ما يدير به المذخر عمله اليومي"
            subtitle="بوابة ويب خاصة بالمذخر، يدخلها من صفحة الدخول نفسها فيوجهه النظام إليها مباشرة."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {portal.map((p) => (
              <div key={p.title} className="rounded-2xl p-6 ring-1 ring-slate-200/80 transition-all hover:-translate-y-0.5 hover:shadow-soft hover:ring-primary-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                  <p.icon size={21} />
                </div>
                <h3 className="mt-4 font-extrabold text-slate-900">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white pb-24">
        <div className="container">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary-700 via-primary-800 to-ink-950 px-6 py-16 text-white md:px-16">
            <div className="absolute inset-0 bg-grid-dark opacity-60" aria-hidden="true" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <h2 className="text-3xl font-black leading-tight md:text-4xl">صاحب مذخر وتريد الوصول إلى الصيدليات على المنصة؟</h2>
                <p className="mt-4 text-lg leading-relaxed text-primary-100/85">
                  تواصل معنا وننشئ حساب مذخرك، ونساعدك في استيراد كتالوجك وإعداد فريقك.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <CTAButton href="/contact" variant="accent" size="lg" icon>
                  تواصل معنا
                </CTAButton>
                <CTAButton href="https://app.faramace.com/login" variant="glass" size="lg">
                  دخول المذخر
                </CTAButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
