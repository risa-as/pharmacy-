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
          subtitle="آخر تحديث: 7 أكتوبر 2026"
        />

        <div className="mt-12 prose prose-slate max-w-none space-y-10 text-right">

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">1. مقدمة</h2>
            <p className="text-slate-600 leading-relaxed">
              فريق فاراماس ("نحن") يلتزم بحماية خصوصية مستخدميه. تصف هذه السياسة كيفية جمع واستخدام وحماية المعلومات التي تقدمها عند استخدامك لنظام فاراماس لإدارة الصيدليات، سواء عبر لوحة تحكم الويب أو تطبيق الهاتف أو برنامج سطح المكتب.
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
              تُستخدم اتصالات HTTPS لحماية البيانات أثناء النقل إلى الخدمة السحابية. تُشفّر بيانات اعتماد WhatsApp ومحتوى محادثاته المحفوظ في فاراماس، ويقتصر الوصول داخل النظام على المستخدمين المخولين في المؤسسة. يجب أيضًا حماية الأجهزة المحلية وحساباتها؛ تشفير الاتصال لا يعني أن كل ملف على جهاز المستخدم مشفّر.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              {['اتصال HTTPS', 'صلاحيات حسب المؤسسة', 'تشفير بيانات WhatsApp المحفوظة'].map((item) => (
                <div key={item} className="bg-primary-50 rounded-xl p-4 text-center">
                  <span className="text-primary-700 font-semibold text-sm">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">5. مشاركة المعلومات</h2>
            <p className="text-slate-600 leading-relaxed">
              لا نبيع أو نؤجر بياناتك الشخصية. يستخدم تقديم الخدمة مزوّدي الاستضافة وقاعدة البيانات، وعند تفعيل WhatsApp تُرسل بيانات الرسائل إلى Meta لتنفيذ الإرسال واستقبال حالاته. وقد تُكشف معلومات عند وجود التزام قانوني أو بموافقتك. لا تُرسل محادثات WhatsApp إلى نموذج ذكاء اصطناعي للرد الآلي في التنفيذ الحالي.
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

          <section id="whatsapp" className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 scroll-mt-28">
            <h2 className="text-xl font-bold text-slate-900 mb-4">7. بيانات WhatsApp وMeta</h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>ربط WhatsApp اختياري. عند تفعيله للمؤسسة، نعالج معرّفي حساب WhatsApp للأعمال والرقم، وبيانات الاعتماد، والقوالب، وأرقام المستلمين وأسماءهم ونصوص الرسائل وحالات الإرسال والتسليم. تُستخدم هذه البيانات لإدارة الربط والحملات والموافقة على التواصل والفوترة داخل فاراماس.</p>
              <p>في مسار المشاركة، يستطيع صاحب الرقم متابعة استخدام تطبيق WhatsApp Business. إذا اختار مشاركة السجل في Meta، تصل إلينا المحادثات التي ينقلها Meta. نحفظ النصوص والتعليقات النصية التي يدعمها النظام مشفّرة، بما فيها الرسائل الواردة والصادرة من التطبيق، لعرضها للمستخدمين المخولين في المؤسسة نفسها. لا ينزّل العرض الحالي محتوى المرفقات، ولا ينشئ مرضى تلقائيًا من جهات الاتصال المستوردة.</p>
              <p>يسمح الربط لـ Meta بمعالجة رقم المستلم ومحتوى الرسالة وبيانات التسليم وفق سياساتها. يجب على المؤسسة الحصول على موافقة التواصل المناسبة؛ استيراد تاريخ المحادثات لا يعد موافقة تسويقية. يمكن للمستلم إيقاف الرسائل بطلب «إيقاف»، ويُحفظ ما يلزم لاحترام طلبه ومنع إعادة الإرسال إليه.</p>
              <p>تُحفظ سجلات الحملات والموافقات والمحادثات لتقديم الخدمة ومراجعة نتائجها. تُمحى محتويات طابور إشعارات Meta بعد معالجتها بنجاح مع إبقاء معرّفات منع التكرار. لا يحذف إلغاء الربط تلقائيًا سجلات المؤسسة داخل فاراماس؛ يمكن طلب حذفها أو تصديرها وفق التعليمات أدناه، مع مراجعة ما يلزم الاحتفاظ به لأسباب محاسبية أو قانونية أو لمنع تكرار الرسائل والخصومات.</p>
              <p>يجب ألا تتضمن الحملات العامة تشخيصًا أو وصفة أو تفاصيل صحية خاصة. للمؤسسة مسؤولية اختيار المحتوى والمستلمين المخولين؛ لا تعتمد الخدمة الحالية مساعدًا آليًا لتقديم الاستشارات العلاجية.</p>
            </div>
          </section>

          <section id="data-deletion" className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 scroll-mt-28">
            <h2 className="text-xl font-bold text-slate-900 mb-4">8. طلب حذف البيانات وإلغاء الربط</h2>
            <p className="text-slate-600 leading-relaxed">يمكن لصاحب المؤسسة أو صاحب البيانات طلب حذف بياناته المرتبطة بفاراماس وMeta. نتأكد من هوية الطالب وصلاحيته ونطاق الطلب قبل التنفيذ، ولا يزيل فصل WhatsApp وحده البيانات المحفوظة لدينا أو لدى Meta.</p>
            <a href="/data-deletion" className="inline-block mt-4 text-primary-600 hover:underline font-semibold">عرض خطوات طلب حذف البيانات</a>
          </section>

          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">9. التواصل معنا</h2>
            <p className="text-slate-600 leading-relaxed">
              لأي استفسارات حول سياسة الخصوصية، يمكنك التواصل معنا عبر:
            </p>
            <div className="mt-4 space-y-2 text-slate-700">
              <p>استخدم <a href="/contact" className="text-primary-600 hover:underline">قنوات التواصل المنشورة لفاراماس</a> للاستفسار عن الخصوصية أو طلب حذف البيانات. لا ترسل كلمة مرور أو رمز وصول أو سجل محادثات مرضى في الطلب الأول.</p>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
