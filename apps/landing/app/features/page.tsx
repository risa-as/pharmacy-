import Image from 'next/image';
import SectionHeading from '../../components/section-heading';
import CTAButton from '../../components/cta-button';
import {
  Server, Zap, Smartphone,
  Network, Package, LineChart, Users, Truck, Wallet,
  Keyboard, Printer, ScanLine, CloudOff, Clock, CreditCard,
  BellRing, AlertTriangle, Camera, ClipboardCheck, BarChart2, UserCheck
} from 'lucide-react';

export default function FeaturesPage() {
  return (
    <main className="flex-grow pt-32 pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20 animate-fade-in-up">
          <SectionHeading 
            title="كل المميزات التي تحتاجها في مكان واحد"
            subtitle="نظام فاراماس صُمم ليكون المرجعية الأولى لإدارة الصيدليات في العراق والمنطقة، بتوفير أدوات قوية وسهلة الاستخدام."
            badge="مميزات النظام"
          />
        </div>

        {/* Feature Sections */}
        <div className="space-y-32">
          
          {/* Section 1: Dashboard */}
          <section id="web" className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative h-[400px] md:h-[500px] bg-slate-100 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner overflow-hidden p-2">
              <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <Image
                  src="/images/dashboard.png"
                  alt="لوحة تحكم فاراماس السحابية - إدارة الصيدليات"
                  fill
                  className="object-cover object-top"
                />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-6 border border-primary-100 dark:border-primary-800">
                <Server size={32} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">لوحة تحكم السحابة (Web)</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                السيطرة الكاملة على أعمالك من أي مكان في العالم وفي أي وقت عبر المتصفح الخاص بك. منصة الإدارة مصممة للمدراء وأصحاب الصيدليات لتتبع كل صغيرة وكبيرة.
              </p>
              
              <ul className="grid sm:grid-cols-2 gap-6 mb-10">
                {[
                  { title: 'إدارة فروع متعددة', icon: <Network size={20} /> },
                  { title: 'تتبع المخزون بدقة', icon: <Package size={20} /> },
                  { title: 'تقارير أرباح متقدمة', icon: <LineChart size={20} /> },
                  { title: 'صلاحيات الموظفين', icon: <Users size={20} /> },
                  { title: 'إدارة الموردين', icon: <Truck size={20} /> },
                  { title: 'تتبع ديون العملاء', icon: <Wallet size={20} /> }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="mt-1 shrink-0 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 p-2 rounded-xl border border-primary-200 dark:border-primary-800 transition-colors">
                      {item.icon}
                    </div>
                    <span className="text-slate-800 dark:text-slate-200 font-bold mt-1.5">{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Section 2: Desktop POS / Offline Sync */}
          <div id="offline" className="scroll-mt-32"></div>
          <section id="desktop" className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500 flex items-center justify-center mb-6 border border-amber-100 dark:border-amber-800">
                <Zap size={32} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">برنامج الكاشير (Desktop POS)</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                برنامج ويندوز مصمم خصيصاً لنقطة البيع داخل الصيدلية. يوفر سرعة هائلة في إصدار الفواتير ويعمل بكل كفاءة وسلاسة حتى عند انقطاع الإنترنت، لتجنب أي توقف في البيع.
              </p>
              
              <ul className="grid sm:grid-cols-2 gap-6 mb-10">
                {[
                  { title: 'دعم كامل للكيبورد', icon: <Keyboard size={20} /> },
                  { title: 'متوافق مع الطابعات', icon: <Printer size={20} /> },
                  { title: 'دعم الباركود السريع', icon: <ScanLine size={20} /> },
                  { title: 'مزامنة أوفلاين', icon: <CloudOff size={20} /> },
                  { title: 'إدارة الشفتات', icon: <Clock size={20} /> },
                  { title: 'مبيعات آجلة سهلة', icon: <CreditCard size={20} /> }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="mt-1 shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-500 p-2 rounded-xl border border-amber-200 dark:border-amber-800 transition-colors">
                      {item.icon}
                    </div>
                    <span className="text-slate-800 dark:text-slate-200 font-bold mt-1.5">{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative h-[400px] md:h-[500px] bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden p-2">
              <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black">
                <Image
                  src="/images/pos-screen.png"
                  alt="برنامج كاشير فاراماس لسطح المكتب - نقطة البيع"
                  fill
                  className="object-cover object-top"
                />
              </div>
            </div>
          </section>

          {/* Section 3: Mobile App */}
          <section id="mobile" className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 flex justify-center items-center">
              <div className="w-[280px] h-[580px] scale-[0.80] md:scale-[0.90] origin-center bg-slate-900 rounded-[3rem] shadow-2xl border-[8px] border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 z-10 flex justify-center">
                  <div className="w-24 h-5 bg-slate-900 rounded-b-2xl"></div>
                </div>
                <Image
                  src="/images/mobile-app.jpg"
                  alt="تطبيق فاراماس للهاتف - متابعة الصيدلية"
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 768px) 100vw, 300px"
                />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6 border border-indigo-200 dark:border-indigo-800">
                <Smartphone size={32} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">تطبيق المدير (Mobile App)</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                تطبيق مخصص لأصحاب الصيدليات يوفر متابعة لحظية لجميع مبيعات وأداء الصيدلية أينما كنت. كما يحتوي على أدوات متقدمة لتسريع عمليات الجرد من خلال الهاتف.
              </p>
              
              <ul className="grid sm:grid-cols-2 gap-6 mb-10">
                {[
                  { title: 'إشعارات لحظية', icon: <BellRing size={20} /> },
                  { title: 'تنبيهات الصلاحية', icon: <AlertTriangle size={20} /> },
                  { title: 'باركود عبر الكاميرا', icon: <Camera size={20} /> },
                  { title: 'جرد سريع وسهل', icon: <ClipboardCheck size={20} /> },
                  { title: 'ملخص الأرباح', icon: <BarChart2 size={20} /> },
                  { title: 'متابعة الدوام', icon: <UserCheck size={20} /> }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="mt-1 shrink-0 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 p-2 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-colors">
                      {item.icon}
                    </div>
                    <span className="text-slate-800 dark:text-slate-200 font-bold mt-1.5">{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

        </div>

        {/* CTA */}
        <div className="mt-32 text-center bg-gradient-brand text-white rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.4) 1px, transparent 0)', backgroundSize: '28px 28px' }}></div>
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">احصل على كل هذه المميزات وأكثر</h2>
            <p className="text-xl text-primary-100 mb-10 max-w-2xl mx-auto">
              أسرع واشترك الآن لتحصل على تجربة مجانية لمدة 7 أيام واكتشف بنفسك كيف يمكن لفاراماس أن يغير طريقة إدارتك لصيدليتك.
            </p>
            <CTAButton href="/pricing" variant="secondary" size="lg">
              عرض الباقات والأسعار
            </CTAButton>
          </div>
        </div>

      </div>
    </main>
  );
}
