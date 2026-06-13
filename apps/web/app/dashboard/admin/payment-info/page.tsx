export const dynamic = "force-dynamic";

import { getPlatformSettings } from "@/app/lib/actions/platform-settings";
import PaymentInfoForm from "@/app/ui/admin/payment-info-form";

export default async function PaymentInfoPage() {
    const settings = await getPlatformSettings();

    return (
        <div className="w-full max-w-3xl mx-auto" dir="rtl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">معلومات الدفع</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    بيانات التحويل البنكي وجهات اتصال الدعم التي تظهر لجميع المؤسسات في صفحة الاشتراك.
                </p>
            </div>
            <PaymentInfoForm initial={settings} />
        </div>
    );
}
