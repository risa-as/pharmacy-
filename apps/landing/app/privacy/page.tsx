import type { Metadata } from 'next';
import SectionHeading from '../../components/section-heading';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية | فاراماس',
  description: 'سياسة خصوصية نظام فاراماس لإدارة الصيدليات',
};

export default function PrivacyPage() {
  return (
    <main className="flex-grow pt-32 pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading
          badge="القانوني"
          title="سياسة الخصوصية"
          subtitle="آخر تحديث: مارس 2026"
        />

        <div className="mt-12 prose prose-slate max-w-none space-y-10 text-right">

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">1. مقدمة</h2>
            <p className="text-slate-600 leading-relaxed">
              نظام فاراماس ("نحن"، "الشركة") يلتزم بحماية خصوصية مستخدميه. تصف هذه السياسة كيفية جمع واستخدام وحماية المعلومات التي تقدمها عند استخدامك لنظام فاراماس لإدارة الصيدليات، سواء عبر لوحة تحكم الويب أو تطبيق الهاتف أو برنامج سطح المكتب.
            </p>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">2. المعلومات التي نجمعها</h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span><strong>بيانات الحساب:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، واسم الصيدلية عند التسجيل.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span><strong>بيانات العمليات:</strong> سجلات المبيعات، المشتريات، وإدارة المخزون التي تُدخلها في النظام.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span><strong>بيانات الجهاز:</strong> نوع المتصفح، نظام التشغيل، وعنوان IP لأغراض الأمان وتحسين الأداء.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span><strong>بيانات الاستخدام:</strong> كيفية تفاعلك مع النظام لتحسين تجربة المستخدم.</span>
              </li>
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">3. كيف نستخدم معلوماتك</h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>تقديم خدمات النظام وصيانتها وتحسينها.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>معالجة المعاملات وإرسال الإشعارات المتعلقة بالاشتراك.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>تقديم الدعم الفني والرد على استفساراتك.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>إرسال التحديثات والإشعارات الأمنية الهامة.</span>
              </li>
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">4. حماية البيانات</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              نستخدم أحدث تقنيات التشفير (SSL/TLS) لحماية بياناتك أثناء النقل والتخزين. يتم تخزين بياناتك على خوادم آمنة في مراكز بيانات موثوقة.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              {['تشفير SSL/TLS', 'نسخ احتياطي يومي', 'مراقبة أمنية 24/7'].map((item) => (
                <div key={item} className="bg-primary-50 rounded-xl p-4 text-center">
                  <span className="text-primary-700 font-semibold text-sm">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">5. مشاركة المعلومات</h2>
            <p className="text-slate-600 leading-relaxed">
              لا نبيع أو نؤجر أو نشارك معلوماتك الشخصية مع أطراف ثالثة، إلا في الحالات التالية: الامتثال للقانون أو أوامر المحاكم، أو لحماية حقوقنا القانونية، أو بموافقتك الصريحة.
            </p>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">6. حقوقك</h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>الحق في الوصول إلى بياناتك الشخصية.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>الحق في تصحيح أي معلومات غير دقيقة.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>الحق في طلب حذف بياناتك عند إنهاء الاشتراك.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0"></span>
                <span>الحق في تصدير بياناتك بصيغة قابلة للقراءة.</span>
              </li>
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">7. التواصل معنا</h2>
            <p className="text-slate-600 leading-relaxed">
              لأي استفسارات حول سياسة الخصوصية، يمكنك التواصل معنا عبر:
            </p>
            <div className="mt-4 space-y-2 text-slate-700">
              <p>📧 البريد الإلكتروني: <a href="mailto:privacy@faramace.com" className="text-primary-600 hover:underline">privacy@faramace.com</a></p>
              <p>📞 الهاتف: <span dir="ltr">+964 780 000 0000</span></p>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
