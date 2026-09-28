import type { Metadata } from 'next';
import { ReactNode } from 'react';
import {
  Globe, Monitor, Smartphone, Warehouse, Network, Boxes, LineChart, Users, Truck, Wallet,
  Keyboard, Printer, ScanLine, CloudOff, Clock, CreditCard, BellRing, AlertTriangle, Camera,
  ClipboardCheck, Sparkles, ArrowLeftRight, Store, FileText, ClipboardList, KeyRound, History, ShieldCheck,
} from 'lucide-react';

import SectionHeading from '../../components/section-heading';
import CTAButton from '../../components/cta-button';
import { DashboardMockup, PhoneMockup, PosShot, WarehouseQuoteMockup } from '../../components/mockups';

export const metadata: Metadata = {
  title: 'المميزات | فاراماس',
  description: 'لوحة الإدارة السحابية، وبرنامج الكاشير الذي يعمل دون إنترنت، وتطبيق الجوال، وشبكة المذاخر — بالتفصيل.',
};

type Item = { title: string; icon: ReactNode };

function Block({
  id, icon, eyebrow, title, text, items, visual, reverse = false, extraId,
}: {
  id: string; icon: ReactNode; eyebrow: string; title: string; text: string; items: Item[]; visual: ReactNode; reverse?: boolean; extraId?: string;
}) {
  return (
    <>
    {extraId && <span id={extraId} className="block scroll-mt-28" aria-hidden="true" />}
    <section id={id} className="scroll-mt-28 grid items-center gap-12 lg:grid-cols-2">
      <div className={reverse ? 'lg:order-2' : ''}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-700 text-white shadow-soft">{icon}</div>
          <span className="text-sm font-bold text-primary-600">{eyebrow}</span>
        </div>
        <h2 className="mt-5 text-3xl font-black leading-tight text-slate-900 md:text-4xl">{title}</h2>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">{text}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.title} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
              <span className="text-primary-700">{item.icon}</span>
              <span className="font-bold text-slate-800">{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? 'lg:order-1' : ''}>{visual}</div>
    </section>
    </>
  );
}

export default function FeaturesPage() {
  return (
    <main className="flex-grow pb-24 pt-32">
      <div className="container">
        <SectionHeading
          badge="مميزات النظام"
          title="كل ما تحتاجه الصيدلية، في أربع منصات مترابطة"
          subtitle="لوحة للإدارة، وكاشير لا يتوقف، وتطبيق في جيبك، وشبكة تربطك بالمذاخر — بقاعدة بيانات واحدة."
          className="mb-20"
        />

        <div className="space-y-28">
          <Block
            id="web"
            icon={<Globe size={24} />}
            eyebrow="لوحة الإدارة السحابية"
            title="تحكم كامل من أي متصفح"
            text="للمدير وصاحب الصيدلية: المخزون والمشتريات والموردون والصناديق والتقارير لكل الفروع، مع صلاحيات دقيقة لكل موظف."
            items={[
              { title: 'فروع متعددة وتحويلات', icon: <Network size={20} /> },
              { title: 'مخزون بالدفعات والانتهاء', icon: <Boxes size={20} /> },
              { title: 'أرباح حقيقية وتقارير', icon: <LineChart size={20} /> },
              { title: 'صلاحيات لكل موظف', icon: <Users size={20} /> },
              { title: 'كشف حساب لكل مورد', icon: <Truck size={20} /> },
              { title: 'صناديق وديون العملاء', icon: <Wallet size={20} /> },
            ]}
            visual={<DashboardMockup />}
          />

          <Block
            id="desktop"
            extraId="offline"
            reverse
            icon={<Monitor size={24} />}
            eyebrow="برنامج الكاشير لسطح المكتب"
            title="بيع سريع، حتى دون إنترنت"
            text="برنامج Windows لنقطة البيع: فاتورة في ثوانٍ، ويستمر البيع عند انقطاع الإنترنت ثم يزامن تلقائياً دون تكرار أو ضياع."
            items={[
              { title: 'اختصارات لوحة المفاتيح', icon: <Keyboard size={20} /> },
              { title: 'طابعات حرارية', icon: <Printer size={20} /> },
              { title: 'قارئ الباركود', icon: <ScanLine size={20} /> },
              { title: 'عمل ومزامنة دون إنترنت', icon: <CloudOff size={20} /> },
              { title: 'ورديات وتسليم الصندوق', icon: <Clock size={20} /> },
              { title: 'نقدي وآجل وزين كاش', icon: <CreditCard size={20} /> },
            ]}
            visual={<PosShot />}
          />

          <Block
            id="mobile"
            icon={<Smartphone size={24} />}
            eyebrow="تطبيق الجوال"
            title="صيدليتك في جيبك"
            text="تابع المبيعات والتنبيهات، وأجرِ الجرد بالكاميرا، واعتمد الطلبات الذكية وطلبات المذاخر وأنت خارج الصيدلية."
            items={[
              { title: 'تنبيهات لحظية', icon: <BellRing size={20} /> },
              { title: 'النقص والانتهاء', icon: <AlertTriangle size={20} /> },
              { title: 'مسح بالكاميرا', icon: <Camera size={20} /> },
              { title: 'جرد منظم', icon: <ClipboardCheck size={20} /> },
              { title: 'الطلب الذكي', icon: <Sparkles size={20} /> },
              { title: 'التحويل بين الفروع', icon: <ArrowLeftRight size={20} /> },
            ]}
            visual={
              <div className="flex justify-center rounded-3xl bg-gradient-to-b from-primary-50 to-white py-10">
                <PhoneMockup className="scale-110" />
              </div>
            }
          />

          <Block
            id="warehouses"
            reverse
            icon={<Warehouse size={24} />}
            eyebrow="شبكة المذاخر"
            title="اطلب من المذاخر من داخل النظام"
            text="الصيدلية ترسل طلبها، والمذخر يسعّر كل صنف من بوابته، وعند اعتماد العرض تُنشأ فاتورة الشراء تلقائياً."
            items={[
              { title: 'دليل المذاخر وكتالوجاتها', icon: <Store size={20} /> },
              { title: 'من الاقتراح إلى الطلب', icon: <Sparkles size={20} /> },
              { title: 'تسعير لكل صنف', icon: <ClipboardList size={20} /> },
              { title: 'فاتورة شراء تلقائية', icon: <FileText size={20} /> },
            ]}
            visual={<WarehouseQuoteMockup />}
          />

          <section id="security" className="scroll-mt-28 rounded-3xl bg-ink-950 p-8 text-white md:p-12">
            <SectionHeading
              tone="dark"
              align="right"
              badge="الحماية والموثوقية"
              title="مصمم ليحمي المال والدواء معاً"
              className="mb-10"
            />
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { icon: KeyRound, title: 'أجهزة معتمدة', text: 'جهاز الكاشير يُعتمد لحسابك، ويُتحقق من هويته عند المزامنة.' },
                { icon: ShieldCheck, title: 'عزل وصلاحيات', text: 'بيانات كل مؤسسة معزولة، وكل موظف يرى ما تسمح به صلاحياته فقط.' },
                { icon: History, title: 'سجل تدقيق', text: 'العمليات الحساسة مسجلة بمن نفذها ومتى، لمراجعة أي فرق.' },
              ].map((s) => (
                <div key={s.title} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                  <s.icon className="text-primary-300" size={24} />
                  <h3 className="mt-3 font-extrabold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-primary-100/75">{s.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-28 rounded-[2rem] bg-slate-50 px-6 py-14 text-center ring-1 ring-slate-200/80">
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">جرّب فاراماس في صيدليتك</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
            احجز عرضاً تجريبياً، واحصل على فترة تجريبية قبل الاشتراك.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <CTAButton href="/contact" variant="primary" size="lg" icon>
              اطلب عرضاً تجريبياً
            </CTAButton>
            <CTAButton href="/pricing" variant="secondary" size="lg">
              عرض الباقات
            </CTAButton>
          </div>
        </div>
      </div>
    </main>
  );
}
