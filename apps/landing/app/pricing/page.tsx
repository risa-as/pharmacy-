import SectionHeading from '../../components/section-heading';
import PricingCard from '../../components/pricing-card';

interface Plan {
  id: string;
  name: string;
  price: number;
  maxBranches: number;
  maxUsers: number;
  maxDevices: number;
  maxMobileUsers: number;
  features: Record<string, boolean> | null;
  isPopular: boolean;
}

async function getPlans(): Promise<Plan[]> {
  try {
    const webUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${webUrl}/api/public/plans`, {
      next: { revalidate: 300 }, // re-fetch every 5 minutes
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.plans ?? [];
  } catch {
    return [];
  }
}

/** Return display name — DB already stores Arabic names, fall back to name as-is */
function planDisplayName(name: string): string {
  return name;
}

/** Build human-readable feature list from plan limits */
function buildFeatures(plan: Plan): string[] {
  const list: string[] = [];

  if (plan.maxBranches < 0) {
    list.push('عدد غير محدود من الفروع');
  } else {
    list.push(plan.maxBranches === 1 ? 'فرع واحد (صيدلية واحدة)' : `حتى ${plan.maxBranches} فروع`);
  }

  if (plan.maxDevices < 0) {
    list.push('عدد غير محدود من أجهزة الكاشير');
  } else if (plan.maxDevices === 1) {
    list.push('1 جهاز كاشير (صندوق)');
  } else {
    list.push(`حتى ${plan.maxDevices} أجهزة كاشير`);
  }

  if (plan.maxMobileUsers < 0) {
    list.push('عدد غير محدود من تطبيقات الموبايل');
  } else if (plan.maxMobileUsers === 1) {
    list.push('1 تطبيق موبايل للمدير');
  } else {
    list.push(`حتى ${plan.maxMobileUsers} تطبيقات موبايل`);
  }

  if (plan.maxUsers < 0) {
    list.push('عدد غير محدود من المستخدمين');
  } else {
    list.push(`حتى ${plan.maxUsers} مستخدم`);
  }

  // Feature flags
  const f = plan.features as Record<string, boolean> | null;
  if (f?.advancedReports)       list.push('تقارير أرباح متقدمة');
  if (f?.productMovement)       list.push('تتبع حركة المواد التفصيلي');
  if (f?.supplierManagement)    list.push('إدارة الموردين');
  if (f?.granularPermissions)   list.push('مستويات صلاحيات متعددة');
  if (f?.warehouseManagement)   list.push('إدارة المخزن المركزي');
  if (f?.interBranchTransfers)  list.push('التحويل بين الفروع');
  if (f?.marketplace)           list.push('الوصول للمتجر');

  if (!f?.advancedReports) list.push('تقارير يومية وشهرية أساسية');
  list.push('دعم فني خلال أوقات الدوام');

  return list;
}

function formatPrice(price: number): string {
  // Price of 0 means custom/contact-for-pricing
  if (price === 0) return 'مخصص';
  return price.toLocaleString('en-US');
}

export default async function PricingPage() {
  const plans = await getPlans();

  // Sort: paid plans first (ascending price), free/custom plans (price=0) last
  const sorted = [...plans].sort((a, b) => {
    if (a.price === 0 && b.price !== 0) return 1;
    if (a.price !== 0 && b.price === 0) return -1;
    return a.price - b.price;
  });

  return (
    <main className="flex-grow pt-32 pb-20 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
          <SectionHeading
            title="باقات مرنة تناسب حجم صيدليتك"
            subtitle="اختر الباقة التي تناسبك واستمتع بجميع المميزات الأساسية لفاراماس بدون تكاليف خفية."
            badge="الأسعار والاشتراكات"
          />
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-24">
          {sorted.map((plan, idx) => {
            // Generate description based on position among paid plans
            const paidPlans = sorted.filter(p => p.price > 0);
            const paidIdx   = paidPlans.indexOf(plan);
            const descriptions = [
              'مناسبة للصيدليات الفردية والمسائية ذات وتيرة العمل المتوسطة.',
              'الخيار المثالي للصيدليات النشطة وتوفير ميزات إدارية متقدمة.',
            ];
            const description = plan.price === 0
              ? 'مصممة للسلاسل الصيدلانية والمذاخر المركزية أو المستشفيات الخاصة.'
              : (descriptions[paidIdx] ?? `باقة ${planDisplayName(plan.name)}`);

            return (
              <PricingCard
                key={plan.id}
                title={planDisplayName(plan.name)}
                price={formatPrice(plan.price)}
                isPopular={plan.isPopular}
                description={description}
                features={buildFeatures(plan)}
                ctaText={plan.price === 0 ? 'تواصل للمبيعات' : undefined}
                delay={idx * 100}
              />
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-12 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">الأسئلة الشائعة حول الاشتراك</h2>
            <div className="w-16 h-1 bg-primary-600 mx-auto rounded-full"></div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-bold text-primary-800 dark:text-primary-400 mb-2">هل يمكنني تجربة النظام قبل الاشتراك؟</h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">بالتأكيد! نوفر فترة تجربة مجانية تتيح لك استخدام كافة خصائص النظام وتطبيق الموبايل للتأكد من أنه يلبي جميع احتياجات عملك.</p>
            </div>

            <div>
              <h4 className="font-bold text-primary-800 dark:text-primary-400 mb-2">ما هي طرق الدفع المتاحة؟</h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">ندعم جميع المحافظ الإلكترونية في العراق (زين كاش، آسيا حوالة، FirstPay)، بالإضافة للدفع المباشر والبطاقات المصرفية.</p>
            </div>

            <div>
              <h4 className="font-bold text-primary-800 dark:text-primary-400 mb-2">هل يمكنني ترقية أو خفض باقتي لاحقاً؟</h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">نعم، يمكنك الترقية إلى الباقة الاحترافية في أي وقت وسيتم حساب الفارق المتبقي، كما يمكنك خفض الباقة مع بداية دورة الفوترة القادمة.</p>
            </div>

            <div>
              <h4 className="font-bold text-primary-800 dark:text-primary-400 mb-2">ماذا يحدث لبياناتي إذا ألغيت اشتراكي؟</h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">نحتفظ بنسخة من بياناتك في وضع القراءة فقط لمدة 30 يوماً. يمكنك خلالها تصدير بياناتك والأدوية وحساباتك بصيغة إكسل قبل الحذف النهائي.</p>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
