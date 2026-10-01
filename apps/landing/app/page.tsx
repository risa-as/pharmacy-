import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpLeft,
  ArrowLeft,
  Sparkles,
  Boxes,
  WifiOff,
  BarChart3,
  ShieldCheck,
  Check,
  Monitor,
  Globe,
  ScanLine,
  Wallet,
  Clock3,
} from "lucide-react";
import CTAButton from "../components/cta-button";
import {
  BrowserShot,
  ScreenImage,
  shots,
  PhoneShot,
  DesktopShot,
} from "../components/screenshot";
import SmartPurchasing from "../components/smart-purchasing";
import FAQAccordion from "../components/faq-accordion";

export const metadata: Metadata = {
  title: "فاراماس | وقتك للصيدلية. والتفاصيل علينا.",
  description:
    "خطّط مشتريات صيدليتك من حركة البيع والمخزون والصلاحية. فاراماس يجمع الكاشير والمخزون والحسابات وطلبات المذاخر على الحاسوب والهاتف.",
};
const benefits = [
  {
    icon: Sparkles,
    n: "01",
    title: "اعرف ماذا تشتري",
    text: "اقتراح كميات مبني على حركة البيع والمخزون ومدة التغطية التي تحددها.",
    href: "#smart-purchasing",
  },
  {
    icon: Boxes,
    n: "02",
    title: "انتبه قبل انتهاء الدواء",
    text: "تابع كل دفعة وكميتها وصلاحيتها، وحدّد الأصناف التي تحتاج إلى إجراء.",
    href: "#inventory",
  },
  {
    icon: WifiOff,
    n: "03",
    title: "واصل البيع دون إنترنت",
    text: "الكاشير يحفظ المبيعات محلياً ويزامنها عند عودة الاتصال.",
    href: "#desktop",
  },
];
export default function Home() {
  return (
    <main className="flex-grow">
      <section className="editorial-hero relative overflow-hidden pt-32 lg:pt-40">
        <div className="container relative">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <div className="animate-fade-in-up">
              <p className="eyebrow">
                <span className="h-2 w-2 rounded-full bg-primary-600" /> نظام
                إدارة الصيدليات وربطها بالمذاخر
              </p>
              <h1 className="mt-6 text-[2.65rem] font-black leading-[1.35] tracking-tight text-ink-900 sm:text-6xl lg:text-[4.25rem]">
                وقتك للصيدلية.
                <br />
                <span className="text-primary-700">والتفاصيل علينا.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-[1.95] text-slate-600">
                ماذا تطلب؟ ما الذي يوشك أن ينتهي؟ وكيف تسير المبيعات؟
                <br className="hidden sm:block" /> فاراماس يجمع الإجابات في مكان
                واحد، لتقضي وقتاً أقل في متابعة التفاصيل ووقتاً أكثر في إدارة
                صيدليتك.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <CTAButton href="/contact" size="lg" icon>
                  شاهد فاراماس في عرض مباشر
                </CTAButton>
                <CTAButton
                  href="#smart-purchasing"
                  variant="secondary"
                  size="lg"
                >
                  اكتشف الشراء الذكي
                </CTAButton>
              </div>
              <p className="mt-5 text-sm text-slate-500">
                كاشير Windows <span className="mx-2 text-slate-300">/</span>{" "}
                لوحة ويب <span className="mx-2 text-slate-300">/</span> تطبيق
                Android
              </p>
            </div>
            <div className="relative hidden rounded-[2rem] border border-white bg-white/65 p-7 shadow-soft lg:block sm:p-9">
              <span className="text-xs font-bold text-primary-700">
                تفاصيل أقل. رؤية أوضح.
              </span>
              <h2 className="mt-5 text-2xl font-extrabold leading-relaxed text-ink-900">
                يوم مزدحم؟
                <br />
                ابدأ بما يحتاج انتباهك.
              </h2>
              <div className="mt-7 divide-y divide-slate-200/70">
                {benefits.map((b) => (
                  <Link
                    key={b.n}
                    href={b.href}
                    className="group flex items-center gap-4 py-5"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                      <b.icon size={23} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold text-ink-900">{b.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        {b.text}
                      </p>
                    </div>
                    <ArrowUpLeft
                      size={19}
                      className="shrink-0 text-slate-400 transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="relative mt-14 pb-12 lg:mt-20 lg:pb-20">
            <div className="product-stage rounded-[1.8rem] p-3 pb-8 sm:p-7 sm:pb-10 lg:pe-36">
              <div className="mb-4 flex items-center justify-between px-2 text-sm text-white/75">
                <span className="flex items-center gap-2">
                  <Globe size={16} /> نظرة واحدة على عمل صيدليتك
                </span>
                <span className="hidden sm:inline">لوحة الإدارة</span>
              </div>
              <BrowserShot
                shot={shots.dashboard}
                priority
                sizes="(min-width: 1280px) 1040px, 92vw"
                className="hidden sm:block"
              />
              <div className="mx-auto w-[235px] sm:hidden">
                <PhoneShot priority />
              </div>
            </div>
            <div className="absolute -bottom-1 left-3 hidden w-[185px] sm:block lg:left-0 lg:w-[235px]">
              <PhoneShot priority />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              لقطات فعلية من فاراماس باستخدام بيانات عرض توضيحية.
            </p>
          </div>
        </div>
      </section>

      <SmartPurchasing />

      <section
        id="inventory"
        className="section-space overflow-hidden bg-[#f3f6f9]"
      >
        <div className="container grid items-center gap-12 lg:grid-cols-[.85fr_1.25fr]">
          <div>
            <p className="eyebrow">02 / المخزون والصلاحية</p>
            <h2 className="section-title">
              الدواء على الرف.
              <br />
              وتفاصيله أمامك.
            </h2>
            <p className="section-copy">
              بين المورد والدفعة وتاريخ الانتهاء، تفاصيل كثيرة تستحق المتابعة.
              اجمعها في شاشة واضحة لتعرف ما تبيعه أولاً وما يحتاج إلى مراجعة.
            </p>
            <ul className="mt-7 space-y-4">
              {[
                "تتبّع الكمية والتكلفة والمورد لكل دفعة",
                "تنبيهات للأصناف الناقصة والقريبة من الانتهاء",
                "خصم الكمية من الدفعة الأقرب انتهاءً عند البيع",
              ].map((t) => (
                <li key={t} className="flex gap-3 font-semibold text-slate-700">
                  <Check className="mt-1 shrink-0 text-primary-600" size={18} />
                  {t}
                </li>
              ))}
            </ul>
            <Link className="text-link mt-8" href="/features#web">
              تعرّف على إدارة المخزون <ArrowLeft size={18} />
            </Link>
          </div>
          <div className="min-w-0">
            <BrowserShot shot={shots.batches} />
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <p className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-600">
                من داخل النظام: حالة كل دفعة في مكانها
              </p>
              <ScreenImage shot={shots.batchesDetail} />
            </div>
          </div>
        </div>
      </section>

      <section id="desktop" className="section-space overflow-hidden bg-white">
        <div className="container">
          <div className="mb-12 grid items-end gap-5 lg:grid-cols-2">
            <div>
              <p className="eyebrow">03 / برنامج الكاشير</p>
              <h2 className="section-title">
                الإنترنت قد ينقطع.
                <br />
                البيع يستمر.
              </h2>
            </div>
            <p className="section-copy max-w-xl">
              واجهة مخصصة للعمل على جهاز الصيدلية: البحث والباركود وسلة البيع في
              متناولك. تُحفظ المبيعات محلياً عند انقطاع الاتصال، ثم تُزامن عند
              عودته.
            </p>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-[#edf2f6] p-3 sm:p-8">
            <DesktopShot />
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: ScanLine,
                title: "من الباركود إلى السلة",
                text: "بحث سريع واختصارات لعمليات البيع اليومية.",
              },
              {
                icon: Wallet,
                title: "المبلغ واضح أمامك",
                text: "نقدي وآجل ومرتجعات مرتبطة بفواتيرها.",
              },
              {
                icon: Clock3,
                title: "كل وردية بحسابها",
                text: "متابعة الصندوق وتسليم الوردية من البرنامج.",
              },
            ].map((b) => (
              <div key={b.title} className="flex gap-3 p-3">
                <b.icon className="mt-1 shrink-0 text-primary-700" size={23} />
                <div>
                  <h3 className="font-extrabold text-ink-900">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {b.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space overflow-hidden bg-ink-950 text-white">
        <div className="container grid items-center gap-14 lg:grid-cols-2">
          <div>
            <p className="eyebrow !text-primary-300">
              04 / من الصيدلية إلى المذخر
            </p>
            <h2 className="section-title !text-white">
              طلبك لا يضيع
              <br />
              بين الرسائل والمكالمات.
            </h2>
            <p className="section-copy !text-slate-300">
              أرسل طلب الصيدلية، وتابع عرض السعر وحالة الطلب من داخل النظام. عند
              اعتماد العرض تُنشأ فاتورة الشراء، وتبقى تفاصيل الرحلة قابلة
              للمراجعة.
            </p>
            <div className="my-8 flex flex-wrap gap-2">
              {["طلب", "عرض سعر", "اعتماد", "استلام"].map((s, i) => (
                <span
                  key={s}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm"
                >
                  <span className="me-2 text-primary-300">0{i + 1}</span>
                  {s}
                </span>
              ))}
            </div>
            <CTAButton href="/warehouses" variant="accent" icon>
              اكتشف شبكة المذاخر
            </CTAButton>
          </div>
          <div className="min-w-0">
            <BrowserShot shot={shots.portalOrders} url="بوابة المذخر" />
            <p className="mt-4 text-sm text-slate-400">
              واجهة فعلية لمتابعة طلبات الصيدليات في بوابة المذخر.
            </p>
          </div>
        </div>
      </section>

      <section
        id="mobile"
        className="section-space overflow-hidden bg-[#eff6f5]"
      >
        <div className="container grid items-center gap-14 lg:grid-cols-2">
          <div className="order-2 flex items-center justify-center gap-5 lg:order-1">
            <div className="w-[230px] sm:w-[250px]">
              <PhoneShot />
            </div>
            <div className="mt-16 hidden w-[230px] sm:block">
              <PhoneShot shot={shots.mobilePlanning} />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="eyebrow">05 / تطبيق Android</p>
            <h2 className="section-title">
              خارج الصيدلية.
              <br />
              داخل الصورة.
            </h2>
            <p className="section-copy">
              افتح هاتفك لتتابع المبيعات والمخزون والتنبيهات، وراجع احتياج
              الشراء دون العودة إلى جهاز المكتب.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "مبيعات اليوم",
                "المخزون والصلاحية",
                "الطلب الذكي",
                "طلبات المذاخر",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2 rounded-xl border border-white bg-white/75 p-4 font-bold text-ink-900"
                >
                  <Check size={17} className="text-primary-700" />
                  {t}
                </div>
              ))}
            </div>
            <Link className="text-link mt-8" href="/features#mobile">
              شاهد تفاصيل تطبيق الهاتف <ArrowLeft size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section-space bg-white">
        <div className="container">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="eyebrow">التفاصيل التي تصنع الفرق</p>
              <h2 className="section-title">
                إدارة أوضح.
                <br />
                كل يوم.
              </h2>
              <p className="section-copy">
                المبيعات والمخزون والحسابات مترابطة، لتراجع عملك من الصورة
                العامة إلى تفاصيل العملية.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: BarChart3,
                  title: "أرباح وتقارير",
                  text: "راجع حركة البيع والتكلفة والمصروفات لتفهم نتيجة العمل.",
                },
                {
                  icon: Wallet,
                  title: "ديون وموردون",
                  text: "أرصدة وتسديدات وكشوف حساب يسهل الرجوع إليها.",
                },
                {
                  icon: Monitor,
                  title: "فروع مترابطة",
                  text: "تابع الفروع والتحويلات بصلاحيات تناسب فريقك.",
                },
                {
                  icon: ShieldCheck,
                  title: "صلاحيات وسجل تدقيق",
                  text: "حدد ما يصل إليه كل موظف وراجع العمليات الحساسة.",
                },
              ].map((b) => (
                <div
                  key={b.title}
                  className="rounded-2xl border border-slate-200 p-7"
                >
                  <b.icon size={25} className="text-primary-700" />
                  <h3 className="mt-4 text-lg font-extrabold text-ink-900">
                    {b.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-slate-500">
                    {b.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="pb-24">
        <div className="container">
          <div className="rounded-[2rem] bg-ink-950 px-6 py-14 text-center text-white sm:px-12">
            <p className="text-sm font-bold text-primary-300">
              شاهد الفرق في سير العمل
            </p>
            <h2 className="mt-4 text-3xl font-black leading-relaxed sm:text-4xl">
              لنبدأ بسؤال واحد:
              <br />
              ما أكثر مهمة تستنزف وقتك؟
            </h2>
            <p className="mx-auto mt-5 max-w-xl leading-relaxed text-slate-300">
              في العرض المباشر، نريك كيف يساعدك فاراماس في الشراء والمخزون
              والبيع، ونجيب عن أسئلتك حسب احتياج صيدليتك.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <CTAButton href="/contact" variant="accent" size="lg" icon>
                احجز عرضاً توضيحياً
              </CTAButton>
              <CTAButton href="/pricing" variant="glass" size="lg">
                تعرّف على الباقات
              </CTAButton>
            </div>
          </div>
        </div>
      </section>
      <section className="pb-24">
        <div className="container max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-black text-ink-900">
            أسئلتك قبل البداية
          </h2>
          <FAQAccordion />
        </div>
      </section>
    </main>
  );
}
