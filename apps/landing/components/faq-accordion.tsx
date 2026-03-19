'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'هل يمكنني استخدام نظام فاراماس بدون اتصال بالإنترنت؟',
    answer: 'نعم، برنامج الكاشير (Desktop POS) مصمم للعمل حتى عند انقطاع الإنترنت. يتم حفظ الفواتير والمبيعات محلياً وتتم مزامنتها تلقائياً مع السحابة فور عودة الاتصال، مما يضمن عدم توقف عملك أبداً.'
  },
  {
    question: 'ما مدى أمان بيانات صيدليتي على السحابة؟',
    answer: 'نحن نستخدم أحدث تقنيات التشفير المتوافقة مع معايير الأمان العالمية. جميع بياناتك يتم تشفيرها وتخزينها في خوادم سحابية محمية مع نسخ احتياطي يومي (Daily Backups) تلقائي لضمان عدم ضياع أي معلومة.'
  },
  {
    question: 'هل يمكنني إدارة أكثر من صيدلية (فروع) بنفس الحساب؟',
    answer: 'بالتأكيد. باقة الشركات لدينا تدعم إدارة عدد غير محدود من الفروع، مع إمكانية ربط المخازن المركزية بالفروع الخاصة بك وتتبع حركة الأدوية والأرباح لكل فرع على حدة من خلال لوحة تحكم واحدة.'
  },
  {
    question: 'هل يدعم النظام قراءة الباركود وطباعة الفواتير؟',
    answer: 'نعم، النظام متوافق تماماً مع جميع أنواع أجهزة قراءة الباركود (Barcode Scanners) وطابعات الفواتير الحرارية وطابعات الباركود المنتشرة في السوق العراقي بدون الحاجة لأي إعدادات معقدة.'
  },
  {
    question: 'كيف يمكنني جرد المخزون الخاص بي عبر النظام؟',
    answer: 'يمكنك جرد المخزون بطريقتين: إما يدوياً عبر لوحة التحكم وأجهزة الكاشير، أو بشكل أسرع وأكثر مرونة من خلال تطبيق الموبايل (Mobile App) الخاص بك عبر استخدام كاميرا الهاتف لمسح باركود الأدوية وتحديث الكميات فوراً.'
  },
  {
    question: 'هل يمكنني تحديد صلاحيات معينة لكل موظف/صيدلاني؟',
    answer: 'نعم، يوفر النظام نظام صلاحيات دقيق جداً (Role-based access). يمكنك إخفاء أسعار الشراء، أو منع الموظف من حذف الفواتير، أو تحديد من يحق له الدخول لتقارير الأرباح والخسائر.'
  },
  {
    question: 'هل يتوفر دعم فني في حال واجهتني مشكلة؟',
    answer: 'نحن نضع الدعم الفني كأولوية قصوى. يتوفر فريقنا للدعم الفني من الساعة 9 صباحاً حتى 10 مساءً يومياً، مع وجود رقم طوارئ مخصص للمشتركين متاح 24/7 لحل أي مشاكل تقنية فوراً.'
  },
  {
    question: 'هل يمكنني استيراد بيانات أدويتي الحالية (Excel)؟',
    answer: 'نعم! لا داعي لإدخال أدويتك من الصفر. يمكنك استيراد قائمة أدويتك بالكامل دفعة واحدة باستخدام ملف Excel، وسيقوم فريق الدعم الفني بمساعدتك في هذه الخطوة مجاناً عند الاشتراك.'
  },
  {
    question: 'كيف تتم عملية إشعار انتهاء الصلاحية للمواد ونواقص الأدوية؟',
    answer: 'يحتوي النظام على نظام ذكي للتنبيهات. سيتم إشعارك عبر تطبيق الموبايل ولوحة التحكم عند اقتراب أي مادة من تاريخ انتهاء صلاحيتها (مثلاً قبلها بـ 3 أشهر أو حسب تحديدك)، بالإضافة لتنبيهك عند وصول كمية مادة معينة للحد الأدنى لطلبها من المورد.'
  }
];

export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div 
            key={index}
            className={`bg-white dark:bg-slate-800 border transition-all duration-300 rounded-2xl overflow-hidden ${
              isOpen 
                ? 'border-primary-500 shadow-md shadow-primary-500/10' 
                : 'border-slate-200 dark:border-slate-700 hover:border-primary-200 dark:hover:border-primary-800'
            }`}
          >
            <button
              onClick={() => toggleAccordion(index)}
              className="w-full text-right px-6 py-5 flex items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <h3 className={`font-bold pr-2 text-lg sm:text-lg transition-colors duration-300 ${
                isOpen ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-200'
              }`}>
                {faq.question}
              </h3>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                isOpen 
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400 rotate-180' 
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                <ChevronDown size={18} />
              </div>
            </button>
            <div 
              className={`transition-all duration-300 ease-in-out ${
                isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-6 pt-0 border-t border-slate-100 dark:border-slate-700/50 mt-4 mr-2">
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed pt-4">
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
