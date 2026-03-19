import {
  BarChart3,
  WifiOff,
  FileText,
  Headphones,
  Package,
  ShoppingCart,
  Monitor,
  Smartphone,
  Laptop
} from 'lucide-react';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import SectionHeading from '../components/section-heading';
import FeatureCard from '../components/feature-card';
import TestimonialCard from '../components/testimonial-card';
import CounterAnimation from '../components/counter-animation';
import CTAButton from '../components/cta-button';

const FAQAccordion = dynamic(() => import('../components/faq-accordion'), { ssr: false });

export default function Home() {
  return (
    <main className="flex-grow pt-20">

      {/* 1. Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 text-white min-h-[90vh] flex items-center">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 rounded-full bg-primary-600/30 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-96 h-96 rounded-full bg-accent/20 blur-3xl"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-right">
              <span className="inline-block py-1 px-4 rounded-full bg-white/10 border border-white/20 text-sm font-bold mb-6 backdrop-blur-sm animate-fade-in">
                الجيل الجديد من أنظمة الصيدليات 🚀
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-black leading-tight mb-6 animate-fade-in-up">
                أدِر صيدليتك <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-l from-accent to-yellow-300">
                  بذكاء ودون توقف
                </span>
              </h1>
              <p className="text-lg md:text-xl text-primary-100 mb-8 max-w-2xl leading-relaxed animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                النظام السحابي الأول محلياً الذي يجمع بين لوحة تحكم الإدارة، تطبيق الهاتف، وبرنامج سطح المكتب الذي يعمل حتى عند انقطاع الإنترنت.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                <CTAButton href="/pricing" variant="primary" size="lg">
                  ابدأ تجربتك المجانية
                </CTAButton>
                <CTAButton href="#demo" variant="glass" size="lg" icon>
                  شاهد النظام
                </CTAButton>
              </div>

              <div className="mt-10 flex items-center gap-4 text-primary-200 text-sm animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                <div className="flex -space-x-3 rtl:space-x-reverse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full bg-primary-700 border-2 border-primary-900 flex items-center justify-center text-xs font-bold shrink-0">
                      ص{i}
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full bg-primary-600 border-2 border-primary-900 flex items-center justify-center text-xs font-bold shrink-0">
                    +100
                  </div>
                </div>
                <p>صيدلية تثق بنا يومياً</p>
              </div>
            </div>

            <div className="relative animate-fade-in-up lg:-mr-8 xl:-mr-16 z-10" style={{ animationDelay: '400ms' }}>
              {/* Decorative Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] max-w-lg bg-gradient-to-tr from-accent/30 via-primary-500/20 to-blue-500/10 blur-[80px] rounded-full -z-10 animate-pulse" style={{ animationDuration: '4s' }}></div>

              <div className="relative w-full aspect-square md:aspect-[4/3] lg:aspect-[1.2/1] group cursor-default">

                {/* 1. Dashboard UI (Center Back) */}
                <div className="absolute top-[10%] left-[10%] right-[10%] bottom-[15%] transition-all duration-700 ease-out z-10 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] group-hover:shadow-[0_40px_80px_rgba(30,58,138,0.3)] bg-slate-900 border border-slate-700 group-hover:-translate-y-4">
                  {/* Browser Bar */}
                  <div className="h-6 w-full bg-slate-200 dark:bg-slate-800 flex items-center px-3 gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                  </div>
                  <div className="relative w-full h-[calc(100%-24px)]">
                    <Image
                      src="/images/dashboard.png"
                      alt="لوحة تحكم إدارة صيدليات فاراماس"
                      fill
                      className="object-cover object-top"
                      priority
                    />
                  </div>
                </div>

                {/* 2. POS Screen UI (Left Middle) */}
                <div className="absolute top-[35%] left-[-5%] right-[45%] bottom-[5%] transition-all duration-700 ease-out z-20 rounded-lg overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.7)] group-hover:shadow-[0_40px_80px_rgba(0,0,0,0.5)] bg-black border-4 border-slate-900 group-hover:-translate-x-4 group-hover:translate-y-2">
                  <div className="relative w-full h-full">
                    <Image
                      src="/images/pos-screen.png"
                      alt="برنامج الكاشير للصيدليات"
                      fill
                      className="object-cover object-top"
                      priority
                    />
                  </div>
                </div>

                {/* 3. Mobile App (Right Front) */}
                <div className="absolute top-[25%] left-[65%] right-[-5%] bottom-[5%] transition-all duration-700 ease-out z-30 shadow-[0_30px_60px_rgba(0,0,0,0.8)] border-[6px] border-slate-900 bg-slate-900 group-hover:translate-x-4 group-hover:-translate-y-2" style={{ borderRadius: '2rem' }}>
                  {/* Notch */}
                  <div className="absolute top-0 inset-x-0 z-10 flex justify-center">
                    <div className="w-1/2 h-5 bg-slate-900 rounded-b-xl"></div>
                  </div>
                  <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: '1.5rem' }}>
                    <Image
                      src="/images/mobile-app.jpg"
                      alt="تطبيق الجوال لإدارة الصيدلية"
                      fill
                      className="object-cover object-top"
                      priority
                    />
                  </div>
                </div>
                {/* Floating Elements */}
                <div className="absolute -left-6 top-20 bg-white text-slate-800 p-4 rounded-xl shadow-xl animate-bounce" style={{ animationDuration: '3s' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <ShoppingCart size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold">مبيعات اليوم</p>
                      <p className="text-lg font-black">200,450 د.ع</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Core Features Section */}
      <section id="features" className="py-24 bg-slate-50 dark:bg-slate-950/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            badge="المميزات الأساسية"
            title="كل ما تحتاجه لإدارة صيدليتك بكفاءة"
            subtitle="نظام فاراماس يوفر مجموعة متكاملة من الأدوات المصممة خصيصاً لتلبية احتياجات الصيدليات الحديثة وتسهيل عمل الصيدلي."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              delay={0}
              icon={<ShoppingCart size={28} />}
              title="نقاط البيع السريعة"
              description="واجهة بيع سهلة وسريعة تدعم قارئ الباركود، اختصارات لوحة المفاتيح، وإصدار الفواتير في ثوانٍ معدودة."
            />
            <FeatureCard
              delay={100}
              icon={<Package size={28} />}
              title="إدارة المخزون الذكية"
              description="تتبع دقيق للأدوية، تواريخ الصلاحية، والتنبيه التلقائي للنواقص والأدوية قريبة الانتهاء."
            />
            <FeatureCard
              delay={200}
              icon={<FileText size={28} />}
              title="الفوترة والمطالبات"
              description="إدارة حسابات الموردين والشركات، سندات الصرف والقبض، وتتبع الديون بكل سهولة وموثوقية."
            />
            <FeatureCard
              delay={300}
              icon={<BarChart3 size={28} />}
              title="تقارير تحليلية شاملة"
              description="تعرف على أرباحك، الأدوية الأكثر مبيعاً، وحركة الصناديق من خلال تقارير مفصلة ورسوم بيانية."
            />
            <FeatureCard
              delay={400}
              icon={<WifiOff size={28} />}
              title="يعمل بدون إنترنت"
              description="استمر في العمل والبيع حتى عند انقطاع الإنترنت. وتتم مزامنة البيانات تلقائياً فور عودة الاتصال."
            />
            <FeatureCard
              delay={500}
              icon={<Headphones size={28} />}
              title="دعم فني بالعربي"
              description="فريق دعم فني متواجد لمساعدتك باللغة العربية عبر الواتساب والمكالمات في أي وقت تحتاجه."
            />
          </div>
        </div>
      </section>

      {/* 3. Three Platforms Section */}
      <section id="platforms" className="py-24 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            badge="الأنظمة المتعددة"
            title="تحكم في صيدليتك من أي مكان"
            subtitle="لأول مرة، نظام يوفر لك ثلاث منصات متكاملة تعمل معاً لضمان بقائك على اطلاع دائم وإدارة سلسة للفروع."
          />

          <div className="flex flex-col gap-16 mt-16">
            {/* Desktop / Offline */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 relative">
                <div className="absolute inset-0 bg-primary-100 rounded-3xl transform -rotate-3 scale-105 -z-10"></div>
                <div className="bg-slate-900 rounded-3xl shadow-2xl aspect-video overflow-hidden border-4 border-slate-800 relative p-2">
                  <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black">
                    <Image
                      src="/images/pos-screen.png"
                      alt="برنامج الكاشير فاراماس لسطح المكتب"
                      fill
                      className="object-cover object-top"
                    />
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mb-6">
                  <Monitor size={32} />
                </div>
                <h3 className="text-3xl font-bold text-slate-900 mb-4">برنامج الكاشير (سطح المكتب)</h3>
                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                  تطبيق مصمم خصيصاً لأجهزة الكمبيوتر في نقطة البيع. يتميز بالسرعة الفائقة والعمل بدون إنترنت (Offline Sync) لضمان عدم توقف المبيعات والعمل اليومي أبداً.
                </p>
                <ul className="space-y-3 mb-8">
                  {['سرعة استجابة عالية بنقرة زر', 'متوافق مع طابعات الفواتير وقارئ الباركود', 'تخزين محلي آمن ومزامنة فورية عند الاتصال'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">✓</div>
                      <span className="text-slate-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
                <CTAButton variant="outline" href="/download">تحميل البرنامج</CTAButton>
              </div>
            </div>

            {/* Mobile App */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mb-6">
                  <Smartphone size={32} />
                </div>
                <h3 className="text-3xl font-bold text-slate-900 mb-4">تطبيق المدير (للهواتف الذكية)</h3>
                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                  احمل صيدليتك في جيبك. تطبيق متكامل للإدارة يمكّنك من متابعة الأرباح، المبيعات اللحظية، وإجراء جرد للمخزون بكل سهولة عبر كاميرا الهاتف.
                </p>
                <ul className="space-y-3 mb-8">
                  {['إشعارات فورية بالعمليات المهمة', 'جرد المخزون باستخدام كاميرا الهاتف', 'متابعة تقارير المبيعات والأرباح اليومية'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">✓</div>
                      <span className="text-slate-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
                <CTAButton variant="outline" href="/download">تحميل التطبيق</CTAButton>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-primary-100/50 rounded-3xl transform rotate-3 scale-105 -z-10"></div>
                <div className="mx-auto w-64 h-[500px] bg-slate-900 rounded-[3rem] shadow-2xl border-[8px] border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 z-10 flex justify-center">
                    <div className="w-24 h-5 bg-slate-900 rounded-b-2xl"></div>
                  </div>
                  <Image
                    src="/images/mobile-app.jpg"
                    alt="تطبيق فاراماس للهاتف الذكي"
                    fill
                    className="object-cover object-top"
                  />
                </div>
              </div>
            </div>

            {/* Web Dashboard */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 relative">
                <div className="absolute inset-0 bg-primary-100 rounded-3xl transform -rotate-2 scale-105 -z-10"></div>
                <div className="bg-slate-50 rounded-lg p-2 shadow-2xl border border-slate-200 aspect-video flex flex-col">
                  {/* Browser Bar */}
                  <div className="h-6 w-full bg-slate-200 rounded-t-lg flex items-center px-2 gap-1.5 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                  </div>
                  <div className="flex-grow bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
                    <Image
                      src="/images/dashboard.png"
                      alt="لوحة تحكم فاراماس السحابية"
                      fill
                      className="object-cover object-top"
                    />
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mb-6">
                  <BarChart3 size={32} />
                </div>
                <h3 className="text-3xl font-bold text-slate-900 mb-4">لوحة تحكم الإدارة السحابية</h3>
                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                  المركز الرئيسي لإدارة أعمالك، يمكنك الوصول إليها من أي متصفح. تتيح لك إدارة فروع متعددة، صلاحيات الموظفين، وتقارير تحليلية متقدمة.
                </p>
                <ul className="space-y-3 mb-8">
                  {['إدارة الفروع المتعددة والمخازن المركزية', 'نظام صلاحيات مفصل لكل موظف', 'دعم الموردين والطلبيات ومرتجعات الشراء'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">✓</div>
                      <span className="text-slate-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
                <CTAButton variant="primary" href="/login">تسجيل الدخول للإدارة</CTAButton>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. Statistics Section */}
      <section className="py-20 bg-primary-700 text-white border-y-[6px] border-accent">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-x-reverse divide-primary-600">
            <CounterAnimation end={150} prefix="+" label="صيدلية مشتركة" />
            <CounterAnimation end={12} label="مدينة مغطاة" />
            <CounterAnimation end={50000} prefix="+" label="عملية بيع يومية" />
            <CounterAnimation end={98} suffix="%" label="نسبة رضا العملاء" />
          </div>
        </div>
      </section>

      {/* 5. Testimonials Section */}
      <section className="py-24 bg-slate-50 dark:bg-slate-950/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            badge="قصص النجاح"
            title="شركاء النجاح يثقون في فاراماس"
            subtitle="نفتخر بأن نكون جزءاً من قصة نجاح العديد من الصيدليات الرائدة محلياً."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            <TestimonialCard
              name="د. أحمد عبد الله"
              pharmacyName="صيدلية الشفاء الكبرى"
              quote="النظام سريع جداً والعمل بدون إنترنت حل لنا مشكلة كبيرة كنا نعاني منها. الدعم الفني متجاوب دائماً."
              delay={0}
            />
            <TestimonialCard
              name="د. سارة محمد"
              pharmacyName="صيدلية الحياة"
              quote="تطبيق الموبايل رائع، يمكنني متابعة أرباح اليوم والمخزون وأنا في المنزل. نقلة نوعية في إدارة الصيدلية."
              delay={100}
            />
            <TestimonialCard
              name="د. علي حسين"
              pharmacyName="مجموعة صيدليات النور"
              quote="إدارة 3 فروع أصبحت أسهل بكثير مع لوحة التحكم المركزية. حركة الأدوية بين الفروع دقيقة جداً."
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* 5.5 FAQ Section */}
      <section className="py-24 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          <SectionHeading
            badge="الأسئلة الشائعة"
            title="كل ما تود معرفته عن فاراماس"
          />

          <div className="mt-12">
            <FAQAccordion />
          </div>
        </div>
      </section>

      {/* 6. Final CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-slate-900 -z-20"></div>
        {/* Abstract pattern */}
        <div className="absolute inset-0 opacity-10 -z-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-600/30 rounded-full blur-[120px] -z-10"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">هل أنت جاهز لتطوير صيدليتك؟</h2>
          <p className="text-xl text-primary-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            انضم إلى المئات من الصيدليات التي تعتمد على فاراماس. احصل على أسبوع تجربة مجانية شاملة لكل المميزات.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <CTAButton href="/contact" variant="primary" size="lg">
              اشترك الآن
            </CTAButton>
            <CTAButton href="/pricing" variant="outline" size="lg" className="border-white text-white hover:bg-white/10 hover:text-white">
              عرض الباقات والأسعار
            </CTAButton>
          </div>
        </div>
      </section>
    </main>
  );
}
