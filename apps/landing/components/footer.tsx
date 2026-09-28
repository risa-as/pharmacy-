import Link from 'next/link';
import { MapPin, Phone, Mail } from 'lucide-react';
import Logo from './logo';

const columns = [
  {
    title: 'المنصة',
    links: [
      { name: 'لوحة التحكم (الويب)', href: '/features#web' },
      { name: 'برنامج الكاشير (سطح المكتب)', href: '/features#desktop' },
      { name: 'تطبيق الجوال', href: '/features#mobile' },
      { name: 'العمل دون إنترنت', href: '/features#offline' },
      { name: 'شبكة المذاخر', href: '/warehouses' },
    ],
  },
  {
    title: 'الشركة',
    links: [
      { name: 'الباقات والأسعار', href: '/pricing' },
      { name: 'تحميل التطبيقات', href: '/download' },
      { name: 'تواصل معنا', href: '/contact' },
      { name: 'تسجيل الدخول', href: 'https://app.faramace.com/login' },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink-950 text-slate-400">
      <div className="container pt-16 pb-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-5 max-w-sm leading-relaxed">
              نظام متكامل لإدارة الصيدليات وربطها بالمذاخر: بيع سريع يعمل دون إنترنت، مخزون بالدفعات وتواريخ الانتهاء، وحسابات
              وتقارير في لوحة واحدة.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-5 font-extrabold text-white">{col.title}</h3>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="transition-colors hover:text-white">
                      {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="mb-5 font-extrabold text-white">تواصل معنا</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 shrink-0 text-primary-400" size={18} />
                <span>بغداد، العراق — الدورة، شارع أبو طيارة</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="shrink-0 text-primary-400" size={18} />
                <a href="tel:+9647857581997" dir="ltr" className="transition-colors hover:text-white">
                  0785 758 1997
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="shrink-0 text-primary-400" size={18} />
                <a href="mailto:info@faramace.com" className="transition-colors hover:text-white">
                  info@faramace.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm md:flex-row">
          <p>© {year} فاراماس للحلول البرمجية. جميع الحقوق محفوظة.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="transition-colors hover:text-white">سياسة الخصوصية</Link>
            <Link href="/terms" className="transition-colors hover:text-white">شروط الاستخدام</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
