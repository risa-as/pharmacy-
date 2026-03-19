import type { Metadata } from 'next';
import SectionHeading from '../../components/section-heading';

export const metadata: Metadata = {
  title: 'شروط الاستخدام | فاراماس',
  description: 'شروط وأحكام استخدام نظام فاراماس لإدارة الصيدليات',
};

export default function TermsPage() {
  return (
    <main className="flex-grow pt-32 pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading
          badge="القانوني"
          title="شروط الاستخدام"
          subtitle="آخر تحديث: مارس 2026 — يُرجى قراءة هذه الشروط بعناية قبل استخدام النظام."
        />

        <div className="mt-12 space-y-10 text-right">

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">1. قبول الشروط</h2>
            <p className="text-slate-600 leading-relaxed">
              باستخدامك لنظام فاراماس ("النظام")، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي جزء منها، فلا يحق لك استخدام النظام. تُطبَّق هذه الشروط على جميع مكونات النظام: لوحة تحكم الويب، تطبيق الهاتف، وبرنامج سطح المكتب.
            </p>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">2. الخدمة المقدمة</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              فاراماس هو نظام سحابي لإدارة الصيدليات يوفر:
            </p>
            <ul className="space-y-2 text-slate-600">
              {[
                'إدارة نقاط البيع وإصدار الفواتير',
                'تتبع المخزون وإدارة الأدوية',
                'إدارة الموردين والمشتريات',
                'تقارير مالية وتحليلية',
                'مزامنة البيانات بين الأجهزة المتعددة',
                'إدارة الموظفين والصلاحيات',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">3. الاشتراك والدفع</h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>تُحتسب رسوم الاشتراك شهرياً وفق الباقة المختارة.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>في حالة عدم السداد خلال 7 أيام من تاريخ الاستحقاق، قد يُعلَّق الحساب مؤقتاً.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>يمكن الترقية أو تخفيض الباقة في أي وقت وسيُطبَّق التغيير في دورة الفوترة التالية.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>لا تُسترد الرسوم المدفوعة إلا في حالات استثنائية وفق تقدير الشركة.</span>
              </li>
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">4. الاستخدام المقبول</h2>
            <p className="text-slate-600 leading-relaxed mb-4">يُحظر استخدام النظام في:</p>
            <ul className="space-y-2 text-slate-600">
              {[
                'أي نشاط مخالف للقانون العراقي أو الأنظمة المحلية.',
                'تخزين بيانات وهمية أو مضللة.',
                'محاولة اختراق النظام أو إلحاق الضرر بالبنية التحتية.',
                'إعادة بيع الخدمة أو منح صلاحيات الوصول لأطراف ثالثة غير مصرح لها.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">5. ملكية البيانات</h2>
            <p className="text-slate-600 leading-relaxed">
              تبقى جميع البيانات التي تدخلها في النظام ملكاً حصرياً لك. لا تدّعي فاراماس أي حق ملكية على بيانات صيدليتك. في حالة إنهاء الاشتراك، يحق لك تصدير جميع بياناتك خلال 30 يوماً من تاريخ الإنهاء.
            </p>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">6. ضمان الخدمة (SLA)</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'وقت التشغيل', value: '99.5%' },
                { label: 'الاستجابة للطوارئ', value: '4 ساعات' },
                { label: 'النسخ الاحتياطي', value: 'يومي' },
              ].map((item) => (
                <div key={item.label} className="text-center bg-primary-50 rounded-xl p-5">
                  <div className="text-2xl font-bold text-primary-700 mb-1">{item.value}</div>
                  <div className="text-sm text-slate-600">{item.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">7. تعديل الشروط</h2>
            <p className="text-slate-600 leading-relaxed">
              تحتفظ فاراماس بحق تعديل هذه الشروط في أي وقت. سيتم إخطارك بأي تغييرات جوهرية عبر البريد الإلكتروني المسجل أو من خلال إشعار داخل النظام قبل 30 يوماً من سريانها. استمرارك في استخدام النظام بعد التعديلات يعني قبولك لها.
            </p>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">8. القانون المطبّق</h2>
            <p className="text-slate-600 leading-relaxed">
              تخضع هذه الشروط لقوانين جمهورية العراق. وفي حالة أي نزاع، يكون الاختصاص القضائي لمحاكم بغداد.
            </p>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">9. التواصل معنا</h2>
            <p className="text-slate-600 leading-relaxed">
              لأي استفسارات حول شروط الاستخدام:
            </p>
            <div className="mt-4 space-y-2 text-slate-700">
              <p>📧 البريد الإلكتروني: <a href="mailto:legal@faramace.com" className="text-primary-600 hover:underline">legal@faramace.com</a></p>
              <p>📞 الهاتف: <span dir="ltr">+964 780 000 0000</span></p>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
