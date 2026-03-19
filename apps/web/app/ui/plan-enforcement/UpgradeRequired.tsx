import Link from "next/link";
import { Lock, Star, Building2 } from "lucide-react";

interface UpgradeRequiredProps {
  featureName: string;
  featureDescription?: string;
  requiredPlan: string;
}

const planIcon = {
  "الباقة الاحترافية": Star,
  "باقة الشركات": Building2,
};

/**
 * UpgradeRequired — shown instead of gated page content when the org's current
 * plan does not include the requested feature.
 */
export default function UpgradeRequired({
  featureName,
  featureDescription,
  requiredPlan,
}: UpgradeRequiredProps) {
  const PlanIcon = planIcon[requiredPlan as keyof typeof planIcon] ?? Star;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      {/* Lock Icon */}
      <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-6 border-2 border-amber-200 dark:border-amber-700">
        <Lock className="w-10 h-10 text-amber-500" />
      </div>

      {/* Plan Badge */}
      <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-full mb-5">
        <PlanIcon className="w-4 h-4" />
        <span>{requiredPlan}</span>
      </div>

      {/* Heading */}
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
        {featureName}
      </h2>

      {/* Description */}
      <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
        {featureDescription ?? `هذه الميزة غير متاحة في باقتك الحالية. قم بالترقية إلى ${requiredPlan} للوصول إلى ${featureName} وجميع الميزات المتقدمة.`}
      </p>

      {/* CTA */}
      <Link
        href="/dashboard/settings/billing"
        className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-amber-500/30 transition-all duration-200 hover:-translate-y-0.5"
      >
        <Star className="w-5 h-5" />
        ترقية الباقة الآن
      </Link>

      <p className="text-slate-400 text-sm mt-4">
        أو{" "}
        <Link href="/contact" className="text-primary-600 hover:underline">
          تواصل مع فريق المبيعات
        </Link>
      </p>
    </div>
  );
}
