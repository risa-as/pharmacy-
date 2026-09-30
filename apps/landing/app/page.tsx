import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import {
  ShoppingCart, Boxes, Truck, Wallet, BarChart3, WifiOff, Monitor, Globe, Smartphone,
  ShieldCheck, KeyRound, History, Building2, CalendarClock, Sparkles, FileSpreadsheet,
  Store, Warehouse, CheckCircle2, UserCog, Receipt,
} from 'lucide-react';

import SectionHeading from '../components/section-heading';
import FeatureCard from '../components/feature-card';
import CTAButton from '../components/cta-button';
import WarehouseFlow from '../components/warehouse-flow';
import { PhoneMockup, WarehouseQuoteMockup } from '../components/mockups';
import { BrowserShot, ScreenImage, shots } from '../components/screenshot';
import Link from 'next/link';

const FAQAccordion = dynamic(() => import('../components/faq-accordion'));

export const metadata: Metadata = {
  title: 'فاراماس | نظام إدارة الصيدليات وربطها بالمذاخر',
  description:
    'فاراماس نظام متكامل للصيدليات: كاشير يعمل دون إنترنت، مخزون بالدفعات وتواريخ الانتهاء، حسابات وتقارير، وطلب الأدوية من المذاخر مباشرة حتى فاتورة الشراء.',
};

const trustPoints = ['يعمل دون إنترنت ويزامن تلقائياً', 'صلاحيات لكل موظف', 'بيانات كل مؤسسة معزولة', 'دعم فني بالعربية'];

const platforms = [
  {
    icon: Monitor,
    name: 'برنامج الكاشير',
    tag: 'Windows · يعمل دون إنترنت',
    text: 'بيع سريع بالباركود واختصارات لوحة المفاتيح، نقدي وآجل وزين كاش، ويستمر البيع عند انقطاع الإنترنت ثم يزامن.',
    href: '/features#desktop',
  },
  {
    icon: Globe,
    name: 'لوحة الإدارة السحابية',
    tag: 'من أي متصفح',
    text: 'المخزون والمشتريات والموردون والصناديق والتقارير وصلاحيات الموظفين لكل الفروع في مكان واحد.',
    href: '/features#web',
  },
  {
    icon: Smartphone,
    name: 'تطبيق الجوال',
    tag: 'Android',
    text: 'مبيعات اليوم والتنبيهات والنواقص، والجرد بكاميرا الهاتف، والطلبات الذكية وطلبات المذاخر وأنت خارج الصيدلية.',
    href: '/features#mobile',
  },
];

const features = [
  { icon: <ShoppingCart size={24} />, title: 'نقطة بيع سريعة', description: 'فاتورة في ثوانٍ بالباركود أو البحث، خصومات بصلاحية، مرتجعات موثقة، وطباعة حرارية.' },
  { icon: <Boxes size={24} />, title: 'مخزون بالدفعات', description: 'كل صنف بدفعاته وتواريخ انتهائها، والبيع من الأقرب انتهاءً، وتنبيه قبل الانتهاء وعند النقص.' },
  { icon: <Truck size={24} />, title: 'مشتريات وموردون', description: 'طلبات شراء واستلام بالدفعات، وكشف حساب لكل مورد بدفعاته ورصيده، دون تكرار أو ضياع.' },
  { icon: <Wallet size={24} />, title: 'صناديق وورديات', description: 'رصيد كل صندوق وحركاته، وتسليم الوردية، وربط كل دفعة نقدية بمستندها.' },
  { icon: <Receipt size={24} />, title: 'ديون العملاء', description: 'بيع آجل لمريض محدد، وتسديد جزئي أو كامل، وكشف واضح لكل مدين.' },
  { icon: <BarChart3 size={24} />, title: 'أرباح وتقارير', description: 'الربح الحقيقي بعد تكلفة البضاعة والمرتجعات والمصروفات، وتقارير الصلاحية وحركة الأصناف والموظفين.' },
  { icon: <Sparkles size={24} />, title: 'الطلب الذكي', description: 'يقترح الكميات من حركة البيع الفعلية، ويحوّل الاقتراح إلى طلب شراء أو إلى طلب لمذخر.' },
  { icon: <Building2 size={24} />, title: 'فروع متعددة', description: 'تحويل بين الفروع، ومقارنة أدائها، وصلاحيات مقيدة بفرع كل موظف.' },
  { icon: <FileSpreadsheet size={24} />, title: 'بداية سهلة', description: 'استيراد الأدوية والمخزون من Excel، وطباعة ملصقات الباركود، وجرد منظم للبداية.' },
];

const assurance = [
  { icon: WifiOff, title: 'لا يتوقف البيع', text: 'الكاشير يحفظ الفواتير محلياً عند انقطاع الإنترنت، ويزامنها عند عودته دون تكرار.' },
  { icon: KeyRound, title: 'أجهزة معتمدة', text: 'جهاز الكاشير يُعتمد لحسابك مرة واحدة، ويُتحقق من هويته عند المزامنة.' },
  { icon: UserCog, title: 'صلاحيات دقيقة', text: 'حدد من يبيع ومن يرى الأرباح ومن يدفع للموردين أو يعدّل المخزون.' },
  { icon: History, title: 'سجل تدقيق', text: 'العمليات الحساسة مسجلة: من فعل ماذا ومتى، لتراجع أي فرق بثقة.' },
  { icon: ShieldCheck, title: 'عزل كامل', text: 'بيانات كل مؤسسة منفصلة، ولا يرى أي حساب إلا ما يخص صيدليته وفروعه.' },
  { icon: CalendarClock, title: 'أرقام متسقة', text: 'الصندوق والمخزون وحساب المورد تتحدث معاً في العملية نفسها، فلا تختلف التقارير.' },
];

const steps = [
  { n: '01', title: 'تواصل معنا', text: 'نتعرف على صيدليتك وعدد فروعك وأجهزتك، ونقترح الباقة المناسبة.' },
  { n: '02', title: 'نجهز بياناتك', text: 'نستورد أدويتك ومخزونك، ونعتمد أجهزة الكاشير ونُعد صلاحيات الموظفين.' },
  { n: '03', title: 'ابدأ البيع', text: 'فريقنا معك في الأيام الأولى، والدعم متاح بالعربية عبر واتساب والهاتف.' },
];

export default function Home() {
  return (
    <main className="flex-grow">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-x-0 top-0 h-[640px] bg-grid-light mask-fade-b" aria-hidden="true" />
        <div className="absolute -top-48 start-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary-100/70 blur-[120px]" aria-hidden="true" />

        <div className="container relative pt-32 lg:pt-40">
          <div className="mx-auto max-w-5xl text-center animate-fade-in-up">
            <Link
              href="/warehouses"
              className="inline-flex items-center gap-2 rounded-full bg-white py-1.5 ps-2 pe-4 text-sm font-bold text-ink-800 shadow-soft ring-1 ring-slate-200 transition-colors hover:ring-primary-300"
            >
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-black text-emerald-800">لأصحاب المذاخر</span>
              <span className="hidden sm:inline">استقبل طلبات الصيدليات وسعّرها من بوابتك</span>
              <span className="sm:hidden">بوابة الطلبات والتسعير</span>
              <span aria-hidden="true">←</span>
            </Link>
            <h1 className="mt-7 text-4xl font-black leading-[1.3] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
              <span className="block xl:whitespace-nowrap">مبيعات صيدليتك ومخزونها وحساباتها</span>
              <span className="block text-primary-700">في مكان واحد</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
              كاشير يستمر في البيع عند انقطاع الإنترنت، ومخزون تعرف فيه كل دفعة وتاريخ انتهائها، وحسابات وتقارير دقيقة،
              وطلبات للمذاخر من داخل النظام حتى فاتورة الشراء.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <CTAButton href="/contact" variant="primary" size="lg" icon>
                احجز عرضاً توضيحياً
              </CTAButton>
              <CTAButton href="/features" variant="secondary" size="lg">
                شاهد المميزات
              </CTAButton>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-500">
              {trustPoints.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="shrink-0 text-primary-600" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto mt-16 max-w-6xl animate-fade-in-up [animation-delay:150ms]">
            <div className="absolute -inset-x-10 top-10 bottom-0 rounded-[3rem] bg-gradient-to-b from-primary-200/50 to-ink-100/40 blur-3xl" aria-hidden="true" />
            <BrowserShot shot={shots.dashboard} priority className="relative hidden rounded-b-none sm:block" />
            {/* Phones: the full dashboard is unreadable at this width, so show the same system at phone width. */}
            <BrowserShot shot={shots.phoneDashboard} sizes="100vw" className="relative mx-auto max-w-sm rounded-b-none sm:hidden" />
          </div>
        </div>
      </section>

      {/* ─── Platforms ────────────────────────────────────────────────────── */}
      <section id="platforms" className="relative bg-white pt-28 pb-24">
        <div className="container">
          <SectionHeading
            badge="ثلاث منصات متكاملة"
            title="كل شخص في الصيدلية يعمل من المكان المناسب له"
            subtitle="الكاشير على جهاز البيع، والمدير من المتصفح، والمالك من هاتفه — والبيانات نفسها في كل مكان."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {platforms.map((p) => (
              <a key={p.name} href={p.href} className="group rounded-2xl bg-slate-50 p-7 ring-1 ring-slate-200/80 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-lift hover:ring-primary-200">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-700 text-white shadow-soft">
                    <p.icon size={24} />
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{p.tag}</span>
                </div>
                <h3 className="mt-6 text-xl font-extrabold text-slate-900">{p.name}</h3>
                <p className="mt-2.5 leading-relaxed text-slate-600">{p.text}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary-700">
                  التفاصيل
                  <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">←</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Spotlight: batches and expiry ─────────────────────────────────── */}
      <section id="batches" className="overflow-hidden bg-slate-50 py-24 lg:py-32">
        <div className="container">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.45fr]">
            <div className="min-w-0">
              <SectionHeading
                align="right"
                badge="المخزون والصلاحية"
                title="اعرف ما ينتهي قبل أن ينتهي"
                subtitle="كل صنف مسجّل بدفعاته: المورد وسعر الشراء والكمية المتبقية وتاريخ الانتهاء. فتعرف ما يجب بيعه أولاً وما يجب إرجاعه، قبل أن يتحول إلى خسارة."
                className="mb-8"
              />
              <ul className="space-y-4">
                {[
                  ['البيع من الأقرب انتهاءً', 'عند البيع تُخصم الكمية من الدفعة الأقرب انتهاءً، ويبقى أثرها محفوظاً في الفاتورة.'],
                  ['تنبيه مبكر', 'الدفعات التي تنتهي قريباً والمنتهية تظهر في لوحة التحكم وفي تنبيهات الجوال.'],
                  ['من المورد إلى الرف', 'الدفعة المستلمة من فاتورة شراء تحمل موردها وسعر شرائها، فتعرف مصدرها وتكلفتها الحقيقية.'],
                ].map(([title, text]) => (
                  <li key={title} className="flex gap-3">
                    <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-primary-600" />
                    <div>
                      <h3 className="font-extrabold text-ink-900">{title}</h3>
                      <p className="mt-1 leading-relaxed text-slate-600">{text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative min-w-0">
              <div className="relative hidden pb-24 sm:block">
                <BrowserShot shot={shots.batches} sizes="(min-width: 1024px) 820px, 100vw" />
                <figure className="absolute bottom-0 -inset-x-5 overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-primary-900/10">
                  <figcaption className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs font-bold text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                    الحالة تُحسب من تاريخ الانتهاء تلقائياً
                  </figcaption>
                  <ScreenImage shot={shots.batchesDetail} sizes="(min-width: 1024px) 900px, 100vw" />
                </figure>
              </div>
              {/* Phones: the expiry alerts at phone width read without zooming or scrolling sideways. */}
              <figure className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-primary-900/10 sm:hidden">
                <figcaption className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs font-bold text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                  تنبيهات قرب الانتهاء على متصفح الهاتف
                </figcaption>
                <ScreenImage shot={shots.phoneExpiryAlerts} sizes="100vw" />
              </figure>
              <a
                href={shots.batches.src}
                target="_blank"
                rel="noopener"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary-700 hover:text-primary-800 sm:hidden"
              >
                عرض شاشة الدفعات كاملة
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="bg-slate-50 py-24">
        <div className="container">
          <SectionHeading
            badge="المميزات"
            title="أدوات عمل يومي، لا قوائم ميزات"
            subtitle="بُنيت كل شاشة حول عمل الصيدلي الفعلي: البيع والاستلام والجرد وتسليم الوردية ومحاسبة الموردين."
          />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
          <div className="mt-12 text-center">
            <CTAButton href="/features" variant="secondary" icon>
              كل المميزات بالتفصيل
            </CTAButton>
          </div>
        </div>
      </section>

      {/* ─── Warehouses network ───────────────────────────────────────────── */}
      <section id="warehouses" className="relative overflow-hidden bg-ink-950 py-24 text-white lg:py-32">
        <div className="absolute inset-0 bg-grid-dark" aria-hidden="true" />
        <div className="absolute -end-40 top-20 h-96 w-96 rounded-full bg-primary-600/25 blur-[120px]" aria-hidden="true" />
        <div className="container relative">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <SectionHeading
                tone="dark"
                align="right"
                badge="جديد: شبكة المذاخر"
                title="من نقص في الرف إلى فاتورة شراء، دون مكالمة واحدة"
                subtitle="الصيدلية ترسل طلبها للمذخر من داخل النظام، والمذخر يسعّر كل صنف من بوابته، وعند الاعتماد تُنشأ فاتورة الشراء تلقائياً."
                className="mb-10"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                  <Store className="text-primary-300" size={24} />
                  <h3 className="mt-3 font-extrabold">للصيدلية</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-primary-100/70">
                    دليل المذاخر وكتالوجاتها وأسعارها، والطلب من الاقتراح الذكي، ومتابعة كل طلب حتى الاستلام.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                  <Warehouse className="text-accent" size={24} />
                  <h3 className="mt-3 font-extrabold">للمذخر</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-primary-100/70">
                    بوابة كاملة: كتالوج ومخزون وطلبات وتسعير، وحسابات العملاء والمندوبين والمرتجعات والسندات.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <CTAButton href="/warehouses" variant="accent" icon>
                  اكتشف شبكة المذاخر
                </CTAButton>
                <CTAButton href="/contact" variant="glass">
                  انضم كمذخر
                </CTAButton>
              </div>
            </div>
            <WarehouseQuoteMockup className="lg:-me-8" />
          </div>

          <div className="mt-20 rounded-3xl bg-white/[0.03] p-6 ring-1 ring-white/10 md:p-10">
            <p className="mb-8 text-sm font-bold text-primary-200">رحلة الطلب في النظام</p>
            <WarehouseFlow />
          </div>
        </div>
      </section>

      {/* ─── Reliability ──────────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="container">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHeading
                align="right"
                badge="الموثوقية"
                title="أرقامك صحيحة، وعملك لا يتوقف"
                subtitle="نظام الصيدلية يمسّ المال والدواء معاً، لذلك صُمم فاراماس ليحمي الاثنين: لا بيع يضيع، ولا دفعة تتكرر، ولا موظف يرى ما لا يخصه."
                className="mb-8"
              />
              <CTAButton href="/features" variant="outline" icon>
                كيف نحمي بياناتك
              </CTAButton>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {assurance.map((a) => (
                <div key={a.title} className="rounded-2xl p-6 ring-1 ring-slate-200/80 transition-colors hover:bg-slate-50">
                  <a.icon className="text-primary-700" size={26} strokeWidth={1.8} />
                  <h3 className="mt-4 text-lg font-extrabold text-slate-900">{a.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Mobile ───────────────────────────────────────────────────────── */}
      <section className="overflow-hidden bg-gradient-to-b from-primary-50 to-white py-24">
        <div className="container">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 -z-10 scale-125 rounded-full bg-primary-200/60 blur-3xl" aria-hidden="true" />
                <PhoneMockup className="scale-110" />
              </div>
            </div>
            <div>
              <SectionHeading
                align="right"
                badge="تطبيق الجوال"
                title="صيدليتك في جيبك، أينما كنت"
                subtitle="تابع مبيعات اليوم والتنبيهات، وأجرِ الجرد بكاميرا الهاتف، واعتمد طلبات الشراء والمذاخر دون الجلوس أمام الحاسوب."
                className="mb-8"
              />
              <ul className="grid gap-3 sm:grid-cols-2">
                {['مبيعات وأرباح لحظية', 'تنبيهات النقص والانتهاء', 'جرد ومسح بالكاميرا', 'الطلبات الذكية والمذاخر', 'الديون والمصروفات', 'التحويل بين الفروع'].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 font-semibold text-slate-700 ring-1 ring-slate-200/80">
                    <CheckCircle2 size={18} className="shrink-0 text-primary-600" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <CTAButton href="/download" variant="primary" icon>
                  تحميل التطبيقات
                </CTAButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Getting started ──────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="container">
          <SectionHeading badge="كيف تبدأ" title="ثلاث خطوات من التواصل إلى أول فاتورة" />
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-2xl bg-slate-50 p-7 ring-1 ring-slate-200/80">
                <span className="text-5xl font-black text-primary-100" aria-hidden="true">{s.n}</span>
                <h3 className="mt-3 text-xl font-extrabold text-slate-900">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="bg-slate-50 py-24">
        <div className="container max-w-4xl">
          <SectionHeading badge="الأسئلة الشائعة" title="أسئلة يطرحها أصحاب الصيدليات والمذاخر" />
          <FAQAccordion />
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────────── */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary-700 via-primary-800 to-ink-950 px-6 py-16 text-center text-white md:px-16">
            <div className="absolute inset-0 bg-grid-dark opacity-60" aria-hidden="true" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-black leading-[1.35] md:text-5xl">جاهز لتجربة فاراماس في صيدليتك؟</h2>
              <p className="mt-5 text-lg leading-relaxed text-primary-100/85">
                احجز عرضاً تجريبياً على بيانات مثل بياناتك، واحصل على فترة تجريبية قبل الاشتراك.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <CTAButton href="/contact" variant="accent" size="lg" icon>
                  اطلب عرضاً تجريبياً
                </CTAButton>
                <CTAButton href="/pricing" variant="glass" size="lg">
                  عرض الباقات والأسعار
                </CTAButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
