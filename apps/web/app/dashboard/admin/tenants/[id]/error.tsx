"use client";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function TenantError({ reset }: { reset: () => void }) {
  return <section dir="rtl" className="space-y-4 rounded-xl border bg-card p-6"><h2 className="font-bold">تعذر تحميل بيانات المؤسسة</h2><p className="text-sm text-muted-foreground">أعد المحاولة عند استقرار الاتصال.</p><div className="flex gap-2"><Button onClick={reset}>إعادة المحاولة</Button><Button asChild variant="outline"><Link href="/dashboard/admin/tenants">العودة إلى المؤسسات</Link></Button></div></section>;
}
