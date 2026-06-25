import { Download, Monitor, Smartphone, Globe, ArrowDownCircle, CheckCircle2 } from 'lucide-react';
import SectionHeading from '../../components/section-heading';
import CTAButton from '../../components/cta-button';

// Re-fetch the SUPER_ADMIN-managed download config at most every 5 minutes.
export const revalidate = 300;

interface DownloadInfo {
  windowsUrl: string;
  windowsVersion: string;
  windowsSize: string;
  androidUrl: string;
  androidVersion: string;
  androidSize: string;
}

// Fallback used when the dashboard API is unreachable — keeps the page working.
const DOWNLOAD_DEFAULTS: DownloadInfo = {
  windowsUrl: 'https://github.com/risa-as/pharmacy-/releases/download/v1.0.0/Faramace.POS.Setup.1.0.0.exe',
  windowsVersion: '1.0.0',
  windowsSize: '110 MB',
  androidUrl: 'https://github.com/risa-as/pharmacy-/releases/download/v1.0.0/Faramace-mobile.apk',
  androidVersion: '1.0.0',
  androidSize: '110 MB',
};

async function getDownloadInfo(): Promise<DownloadInfo> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.faramace.com';
  try {
    const res = await fetch(`${base}/api/public/download-info`, { next: { revalidate: 300 } });
    if (!res.ok) return DOWNLOAD_DEFAULTS;
    const data = (await res.json()) as Partial<DownloadInfo>;
    // Merge so any missing field falls back to a sensible default.
    return { ...DOWNLOAD_DEFAULTS, ...data };
  } catch {
    return DOWNLOAD_DEFAULTS;
  }
}

export default async function DownloadPage() {
  const info = await getDownloadInfo();

  return (
    <main className="flex-grow pt-32 pb-20 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
          <SectionHeading
            title="حمل فاراماس وابدأ بإدارة صيدليتك"
            subtitle="نوفر لك تطبيقات مخصصة لكل بيئة عمل لضمان دقة وسرعة الإنجاز. اختر المنصة التي تناسب جهازك الحالي للبدء."
            badge="تحميل التطبيقات"
            titleClassName="text-slate-900"
          />
        </div>

        {/* Download Cards */}
        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-24">

          {/* Windows Desktop */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col items-center text-center transform hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-bl-full -z-10"></div>

            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 mb-6 relative">
              <Monitor size={40} />
              <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-sm">
                <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center text-white">
                  <Download size={14} />
                </div>
              </div>
            </div>

            <h3 className="text-2xl font-bold text-slate-900 mb-3">برنامج الكاشير</h3>
            <p className="text-slate-600 mb-2">لأجهزة نقطة البيع (POS)</p>
            <div className="inline-block bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full mb-8 font-medium">
              Windows 10 / 11 (64-bit)
            </div>

            <ul className="text-right space-y-3 mb-8 text-sm text-slate-600 w-full bg-slate-50 p-4 rounded-xl border border-slate-100">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>تحميل وتثبيت ملف exe. المباشر</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>تسجيل الدخول برمز فرع الصيدلية</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>يعمل بدون إنترنت بعد تسجيل الدخول الأول</span>
              </li>
            </ul>

            <div className="text-right w-full mb-6 bg-primary-50/50 dark:bg-primary-900/20 p-4 rounded-xl border border-primary-100/50 dark:border-primary-800/30">
              <h4 className="font-bold text-primary-800 dark:text-primary-300 mb-2 text-sm">خطوات التثبيت السريعة:</h4>
              <ol className="text-sm text-primary-700/80 dark:text-primary-400/80 space-y-2 list-decimal list-inside font-medium">
                <li>حمل ملف البرنامج (exe.)</li>
                <li>قم بتشغيل وتثبيت البرنامج</li>
                <li>سجل الدخول برمز فرعك</li>
              </ol>
            </div>

            <div className="mt-auto w-full">
              <CTAButton
                variant="primary"
                fullWidth
                href={info.windowsUrl}
                icon
              >
                تحميل للويندوز
              </CTAButton>
              <p className="text-slate-400 text-xs mt-3">الإصدار {info.windowsVersion} • حجم الملف: {info.windowsSize}</p>
            </div>
          </div>

          {/* Android Mobile */}
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-primary-900/5 border-2 border-primary-500 hover:-translate-y-2 transition-transform duration-300 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 bg-primary-500 text-white text-xs font-bold py-1.5 uppercase tracking-wide">
              متوفر الآن
            </div>

            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-6 mt-4 relative">
              <Smartphone size={40} />
              <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-sm">
                <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center text-white">
                  <Download size={14} />
                </div>
              </div>
            </div>

            <h3 className="text-2xl font-bold text-slate-900 mb-3">تطبيق الإدارة</h3>
            <p className="text-slate-600 mb-2">للمدراء والمتابعة عن بعد</p>
            <div className="inline-block bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full mb-8 font-medium">
              Android 8.0+
            </div>

            <ul className="text-right space-y-3 mb-8 text-sm text-slate-600 w-full bg-slate-50 p-4 rounded-xl border border-slate-100">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>تحميل مباشر لملف APK بدون متجر</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>تسجيل الدخول بحساب المدير/المالك</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>استخدام الكاميرا كقارئ باركود سريع</span>
              </li>
            </ul>

            <div className="text-right w-full mb-6 bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-800/30">
              <h4 className="font-bold text-indigo-800 dark:text-indigo-300 mb-2 text-sm">خطوات التثبيت السريعة:</h4>
              <ol className="text-sm text-indigo-700/80 dark:text-indigo-400/80 space-y-2 list-decimal list-inside font-medium">
                <li>حمّل ملف APK على هاتفك</li>
                <li>فعّل "تثبيت من مصادر غير معروفة"</li>
                <li>سجل الدخول كصاحب صيدلية</li>
              </ol>
            </div>

            <div className="mt-auto w-full space-y-3">
              <CTAButton
                variant="primary"
                fullWidth
                href={info.androidUrl}
                icon
              >
                تحميل APK للأندرويد
              </CTAButton>
              <p className="text-slate-400 text-xs mt-1 text-center">الإصدار {info.androidVersion} • حجم الملف: {info.androidSize}</p>
            </div>
          </div>

          {/* Web Cloud */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col items-center text-center transform hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-primary-50 rounded-br-full -z-10"></div>

            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 mb-6 relative">
              <Globe size={40} />
            </div>

            <h3 className="text-2xl font-bold text-slate-900 mb-3">لوحة التحكم السحابية</h3>
            <p className="text-slate-600 mb-2">لإدارة الفروع وتخصيص النظام</p>
            <div className="inline-block bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full mb-8 font-medium">
              جميع المتصفحات الحديثة
            </div>

            <ul className="text-right space-y-3 mb-8 text-sm text-slate-600 w-full bg-slate-50 p-4 rounded-xl border border-slate-100">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>لا يتطلب تحميل أو تثبيت إضافي</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>الوصول من أي جهاز متصل بالإنترنت</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-primary-500 mt-0.5 shrink-0" />
                <span>وصول دائم لآخر التحديثات فوراً</span>
              </li>
            </ul>

            <div className="text-right w-full mb-6 bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 text-sm">خطوات الدخول السريعة:</h4>
              <ol className="text-sm text-slate-800 dark:text-slate-200 space-y-2 list-decimal list-inside font-medium">
                <li>افتح الرابط عبر المتصفح</li>
                <li>أدخل البريد الإلكتروني وكلمة المرور</li>
                <li>ابدأ بإدارة صيدليتك فوراً</li>
              </ol>
            </div>

            <div className="mt-auto w-full">
              <CTAButton variant="secondary" fullWidth href="https://app.faramace.com/login" icon>
                فتح لوحة التحكم
              </CTAButton>
              <p className="text-slate-400 text-xs mt-3">يُفضل استخدام متصفح Chrome</p>
            </div>
          </div>

        </div>

        {/* Installation Instructions */}
        <div className="max-w-4xl mx-auto mt-20 bg-primary-900 text-white rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-2xl">
          <div className="absolute right-0 top-0 w-64 h-full bg-primary-800/50 skew-x-12 transform origin-top-right -z-10"></div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center shrink-0 border border-white/20">
              <ArrowDownCircle size={48} className="text-accent" />
            </div>

            <div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 text-white">تحتاج مساعدة في التثبيت؟</h3>
              <p className="text-primary-100 leading-relaxed max-w-2xl mb-6">
                فريق الدعم الفني الخاص بنا جاهز لمساعدتك في تثبيت النظام على أجهزتك وإعداد ربط الفروع وتدريب الموظفين دون أي تكلفة إضافية.
              </p>
              <div className="flex gap-4">
                <CTAButton variant="primary" href="/contact">تواصل مع الدعم للتركيب</CTAButton>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
