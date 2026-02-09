import { Button } from "@faramace/ui";
import Link from "next/link";
import { Building2, LayoutDashboard, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <div className="max-w-3xl space-y-8">

        {/* الشعار / العنوان */}
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-blue-600 p-4 text-white shadow-xl">
            <Building2 className="h-12 w-12" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            فاراماس <span className="text-blue-600">السحابي</span>
          </h1>
          <p className="max-w-xl text-lg text-gray-600">
            نظام إدارة الصيدليات المتقدم
          </p>
        </div>

        {/* بطاقات الإجراءات */}
        <div className="grid w-full gap-6 sm:grid-cols-2">

          <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
            <ShieldCheck className="mb-4 h-10 w-10 text-green-600" />
            <h3 className="mb-2 text-xl font-semibold text-gray-900">لوحة التحكم</h3>
            <p className="mb-6 text-sm text-gray-500">
              إدارة المنظمات والفروع والإعدادات العامة
            </p>
            <Button asChild className="w-full" variant="default">
              <Link href="/dashboard">
                الذهاب للوحة التحكم
              </Link>
            </Button>
          </div>

          <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
            <LayoutDashboard className="mb-4 h-10 w-10 text-purple-600" />
            <h3 className="mb-2 text-xl font-semibold text-gray-900">حالة النظام</h3>
            <p className="mb-6 text-sm text-gray-500">
              عرض عقد المزامنة النشطة وصحة الخادم
            </p>
            <Button asChild className="w-full" variant="outline">
              <Link href="/login">
                تسجيل الدخول
              </Link>
            </Button>
          </div>

        </div>

        <div className="text-xs text-gray-400">
          مدعوم من بنية فاراماس المتكاملة
        </div>

      </div>
    </main>
  );
}
