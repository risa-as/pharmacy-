'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'الرئيسية', href: '/' },
    { name: 'المميزات', href: '/#features' },
    { name: 'الأنظمة', href: '/#platforms' },
    { name: 'الأسعار', href: '/pricing' },
    { name: 'تحميل', href: '/download' },
    { name: 'تواصل معنا', href: '/contact' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm border-b border-slate-100 dark:border-slate-800 py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
              F
            </div>
            <span className={`text-2xl font-bold ${isScrolled ? 'text-primary-800 dark:text-primary-400' : 'text-slate-800 dark:text-slate-100'}`}>
              فاراماس
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Desktop Auth Button */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="https://app.faramace.com/login" // Update this to actual dashboard URL later
              className="text-primary-700 dark:text-primary-400 font-semibold hover:text-primary-800 dark:hover:text-primary-300 transition-colors"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/pricing"
              className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              ابدأ مجاناً
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-slate-600 p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-xl py-4 px-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-slate-700 dark:text-slate-200 font-medium py-2 px-4 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
          <div className="h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
          <Link
            href="https://app.faramace.com/login"
            className="text-center font-semibold text-primary-700 dark:text-primary-400 py-2 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-slate-800"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            تسجيل الدخول
          </Link>
          <Link
            href="/pricing"
            className="text-center font-semibold text-white bg-primary-600 py-2 rounded-lg"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            ابدأ مجاناً
          </Link>
        </div>
      )}
    </header>
  );
}
