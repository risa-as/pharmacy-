import { auth } from "@/auth";
import { redirect } from "next/navigation";
import WhatsAppPricingForm from "@/app/ui/admin/whatsapp-pricing-form";

export default async function WhatsAppPricingPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/dashboard");
  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          تسعير رسائل WhatsApp
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          إدارة أسعار الإرسال لأرقام العراق ونسبة الزيادة، مع معاينة السعر
          النهائي قبل الحفظ.
        </p>
      </div>
      <WhatsAppPricingForm />
    </div>
  );
}
