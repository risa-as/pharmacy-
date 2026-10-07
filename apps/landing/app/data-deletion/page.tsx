import type { Metadata } from 'next';
import Link from 'next/link';
import SectionHeading from '../../components/section-heading';

export const metadata: Metadata = {
  title: 'حذف البيانات وربط Meta | فاراماس',
  description: 'خطوات طلب حذف بيانات فاراماس وWhatsApp وإلغاء الربط مع Meta.',
};

export default function DataDeletionPage() {
  return (
    <main className="flex-grow pt-32 pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading badge="الخصوصية" title="طلب حذف البيانات" subtitle="بيانات فاراماس واتصال WhatsApp وMeta — آخر تحديث: 7 أكتوبر 2026" />
        <div className="space-y-6 text-right">
          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">كيف تقدم طلبك؟</h2>
            <ol className="list-decimal list-inside space-y-4 text-slate-600 leading-relaxed">
              <li>تواصل مع دعم فاراماس من <Link href="/contact" className="text-primary-600 hover:underline">صفحة التواصل الرسمية</Link>، واذكر أن الطلب يتعلق بحذف البيانات.</li>
              <li>حدد اسم المؤسسة وبريد الحساب المرتبط بها ونطاق الطلب: بيانات اتصال Meta، أو محادثات WhatsApp، أو بياناتك الشخصية، أو حساب المؤسسة. إذا كنت مستلمًا لرسائل صيدلية، اذكر اسمها ورقمك الذي استقبل الرسائل عبر قناة الدعم الرسمية.</li>
              <li>لا ترسل كلمة مرور أو رمز وصول أو تفاصيل علاجية أو كشفًا مصرفيًا. يحدد الدعم طريقة التحقق المناسبة من هويتك وصلاحيتك قبل معالجة الطلب.</li>
              <li>بعد التحقق، يوضح الدعم البيانات المشمولة وأي سجلات يلزم الاحتفاظ بها والسبب، ثم يؤكد نتيجة المعالجة أو يطلب ما يلزم لاستكمال الطلب. لا يعتبر إرسال الطلب تأكيدًا بأن الحذف تم.</li>
            </ol>
          </section>
          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">إلغاء الربط يختلف عن حذف البيانات</h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>يمكن لصاحب الرقم إلغاء وصول تطبيق فاراماس من إعدادات التكاملات لدى Meta، أو طلب فصل الاتصال من مدير المنصة. هذا يوقف الوصول بحسب حالة Meta، لكنه لا يحذف تلقائيًا ما سبق حفظه في فاراماس، ولا يحذف محادثات هاتفك.</p>
              <p>قبل فصل الاتصال يجب إيقاف الرسائل التي لم تُرسل وحسم الرسائل ذات النتيجة غير المؤكدة. لا تُعد إرسالها بعملية جديدة، ولا تمسح بيانات الموقع لمعالجة محاولة غير محسومة.</p>
              <p>تخضع البيانات الموجودة لدى Meta أو في تطبيق WhatsApp لسياساتها وإجراءاتها؛ طلب الحذف من فاراماس يخص البيانات التي نتحكم بها.</p>
            </div>
          </section>
          <section className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-4">السجلات المحاسبية والأمنية</h2>
            <p className="text-slate-600 leading-relaxed">تُراجع سجلات التحصيل والفوترة والتدقيق والموافقات ومنع تكرار العمليات بصورة منفصلة عن محتوى المحادثات. قد يلزم الاحتفاظ ببعضها لالتزام قانوني أو محاسبي أو لاحترام إلغاء الاشتراك، ويُوضح ذلك عند معالجة الطلب. إنهاء ربط WhatsApp لا يقتضي حذف فواتير الصيدلية أو تغيير مخزونها وأرصدتها.</p>
          </section>
          <Link href="/privacy#whatsapp" className="inline-flex text-primary-600 hover:underline font-semibold">العودة إلى سياسة الخصوصية وبيانات WhatsApp</Link>
        </div>
      </div>
    </main>
  );
}
