'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'هل يعمل الكاشير عند انقطاع الإنترنت؟',
    answer:
      'نعم. برنامج الكاشير لسطح المكتب يحفظ الفواتير على الجهاز عند انقطاع الاتصال، ويزامنها مع السحابة عند عودته. المزامنة مصممة بحيث لا تتكرر الفاتورة ولا تضيع إن انقطع الرد في منتصفها.',
  },
  {
    question: 'كيف تُحمى بيانات صيدليتي؟',
    answer:
      'بيانات كل مؤسسة معزولة عن غيرها، والاتصال مشفر، وكل موظف يرى ويعدّل فقط ما تسمح به صلاحياته. أجهزة الكاشير تُعتمد لحسابك، والعمليات الحساسة تُسجل في سجل تدقيق يبين من فعل ماذا ومتى.',
  },
  {
    question: 'ما هي شبكة المذاخر؟',
    answer:
      'هي ربط الصيدليات بالمذاخر داخل النظام: الصيدلية ترى كتالوج المذخر وأسعاره وترسل طلبها، والمذخر يراجعه ويسعّر كل صنف (متوفر أو جزئي أو نافد) من بوابته، ثم تعتمد الصيدلية العرض فتُنشأ فاتورة الشراء تلقائياً.',
  },
  {
    question: 'أنا صاحب مذخر، كيف أنضم؟',
    answer:
      'تواصل معنا وننشئ لك حساب المذخر ونجهز معك كتالوجك (ويمكن استيراده من Excel بالباركود). تدخل من صفحة الدخول نفسها، ويوجهك النظام إلى بوابة المذخر، وتضيف موظفيك بأدوار وصلاحيات مناسبة.',
  },
  {
    question: 'هل أحتاج إلى إدخال أدويتي من الصفر؟',
    answer:
      'لا. يمكن استيراد الأدوية والمخزون من ملف Excel، ويساعدك فريقنا في تجهيز الملف والتحقق من النتيجة قبل بدء البيع.',
  },
  {
    question: 'هل يدعم النظام أكثر من فرع؟',
    answer:
      'نعم حسب الباقة: لوحة واحدة لكل الفروع، وتحويل الأصناف بينها، ومقارنة أدائها، مع صلاحيات تقيد كل موظف بفرعه.',
  },
  {
    question: 'هل يدعم قارئ الباركود والطابعات الحرارية؟',
    answer:
      'نعم. يعمل الكاشير مع قارئات الباركود وطابعات الفواتير الحرارية، ويطبع ملصقات الباركود للأصناف. وفي تطبيق الجوال يمكن المسح بالكاميرا للجرد والبحث.',
  },
  {
    question: 'كيف أعرف الأصناف القريبة من الانتهاء أو الناقصة؟',
    answer:
      'المخزون مسجل بالدفعات وتواريخ انتهائها، فينبهك النظام في لوحة التحكم وتطبيق الجوال بالأصناف القريبة من الانتهاء والأصناف التي نزلت تحت حد الطلب، ويقترح عليك «الطلب الذكي» الكميات المناسبة.',
  },
  {
    question: 'كيف أحصل على الدعم الفني؟',
    answer:
      'عبر واتساب والهاتف باللغة العربية خلال أوقات العمل، ونرافقك في الأيام الأولى بعد التشغيل.',
  },
];

export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        return (
          <div
            key={faq.question}
            className={`overflow-hidden rounded-2xl bg-white ring-1 transition-all duration-300 ${
              isOpen ? 'ring-primary-300 shadow-soft' : 'ring-slate-200 hover:ring-primary-200'
            }`}
          >
            <h3>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-right"
              >
                <span className={`text-lg font-bold transition-colors ${isOpen ? 'text-primary-700' : 'text-slate-800'}`}>{faq.question}</span>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                    isOpen ? 'rotate-180 bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <ChevronDown size={18} />
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" hidden={!isOpen} className="px-6 pb-6">
              <p className="border-t border-slate-100 pt-4 leading-relaxed text-slate-600">{faq.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
