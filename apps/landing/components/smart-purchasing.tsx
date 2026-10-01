import { ArrowLeft, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { BrowserShot, PhoneShot, shots } from "./screenshot";
export default function SmartPurchasing() {
  return (
    <section
      id="smart-purchasing"
      className="section-space scroll-mt-24 bg-white"
    >
      <div className="container">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow">
              <Sparkles size={17} /> 01 / الشراء الذكي
            </p>
            <h2 className="section-title">
              لا تبدأ طلب الشراء
              <br />
              <span className="text-primary-700">من ورقة فارغة.</span>
            </h2>
          </div>
          <div>
            <p className="section-copy">
              بدلاً من مراجعة كل صنف وحساب احتياجه يدوياً، ابدأ بقائمة مقترحة من
              بيانات صيدليتك. حدّد مدة التغطية، راجع الكميات، ثم جهّز طلبك.
            </p>
            <p className="mt-4 text-sm font-semibold text-primary-700">
              اقتراح محسوب يساعدك على القرار. والمراجعة والاعتماد لك.
            </p>
          </div>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {[
            [
              "01",
              "يقرأ حركة البيع",
              "يعتمد على صافي المبيعات بعد المرتجعات، خلال فترة التحليل.",
            ],
            [
              "02",
              "يحسب الاحتياج",
              "يراعي الدفعات الصالحة والتوريدات المؤكدة ومدة التوريد والأمان.",
            ],
            [
              "03",
              "يجهّز خطوة الشراء",
              "راجع المقترح وعدّل الكميات، ثم حوّله إلى طلب شراء أو طلب مذخر.",
            ],
          ].map(([n, title, text]) => (
            <div
              key={n}
              className="rounded-2xl border border-primary-100 bg-primary-50/50 p-6"
            >
              <span className="text-xs font-black tracking-wider text-primary-600">
                {n}
              </span>
              <h3 className="mt-3 text-xl font-extrabold text-ink-900">
                {title}
              </h3>
              <p className="mt-3 leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 overflow-hidden rounded-[1.8rem] border border-slate-200 bg-[#f3f6f9] p-3 sm:p-6">
          <BrowserShot
            shot={shots.smartPurchasing}
            url="فاراماس / الشراء الذكي"
            className="hidden sm:block"
          />
          <div className="mx-auto w-[250px] py-3 sm:hidden">
            <PhoneShot shot={shots.mobilePlanning} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-5 text-sm">
            <span className="flex items-center gap-2 text-slate-600">
              <Check size={17} className="text-primary-700" /> لقطة من شاشة
              التخطيط ببيانات عرض
            </span>
            <Link href="/contact" className="text-link">
              شاهدها في عرض مباشر <ArrowLeft size={17} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
