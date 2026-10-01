'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import Logo from './logo';

const APP_LOGIN = 'https://app.faramace.com/login';

const navLinks = [
  { name: 'الشراء الذكي', href: '/#smart-purchasing' },
  { name: 'المميزات', href: '/features' },
  { name: 'المذاخر', href: '/warehouses', badge: 'جديد' },
  { name: 'الأسعار', href: '/pricing' },
  { name: 'التحميل', href: '/download' },
  { name: 'تواصل معنا', href: '/contact' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // Pages that open on a dark band keep a light header until the user scrolls.
  const overDark = !scrolled && pathname === '/warehouses';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open ? 'bg-white/90 backdrop-blur-lg shadow-[0_1px_0_rgba(15,23,42,0.06)] py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="container">
        <div className="flex items-center justify-between gap-6">
          <Logo tone={overDark && !open ? 'light' : 'dark'} />

          <nav className="hidden items-center gap-1 lg:flex" aria-label="التنقل الرئيسي">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-semibold transition-colors ${
                    overDark
                      ? active ? 'text-white' : 'text-primary-100/80 hover:text-white'
                      : active ? 'text-primary-700' : 'text-slate-600 hover:text-primary-700'
                  }`}
                >
                  {link.name}
                  {link.badge && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-black leading-none text-ink-950">{link.badge}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href={APP_LOGIN}
              className={`rounded-lg px-4 py-2 font-bold transition-colors ${overDark ? 'text-white hover:bg-white/10' : 'text-primary-700 hover:bg-primary-50'}`}
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/contact"
              className={`rounded-xl px-5 py-2.5 font-bold shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                overDark ? 'bg-primary-400 text-ink-950 hover:bg-primary-300' : 'bg-primary-700 text-white hover:bg-primary-800'
              }`}
            >
              احجز عرضاً توضيحياً
            </Link>
          </div>

          <button
            type="button"
            className={`rounded-lg p-2 lg:hidden ${overDark && !open ? 'text-white' : 'text-slate-700'}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-t border-slate-100 bg-white px-4 pb-6 pt-3 shadow-lift lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="التنقل على الجوال">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                {link.name}
                {link.badge && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-ink-950">{link.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href={APP_LOGIN} className="rounded-xl py-3 text-center font-bold text-primary-700 ring-1 ring-primary-200">
              تسجيل الدخول
            </Link>
            <Link href="/contact" className="rounded-xl bg-primary-700 py-3 text-center font-bold text-white">
              اطلب عرضاً
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
