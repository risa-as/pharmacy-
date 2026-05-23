import Link from "next/link";
import {
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-8 border-t border-slate-800">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand Info */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                F
              </div>
              <span className="text-2xl font-bold text-white">فاراماس</span>
            </Link>
            <p className="text-slate-400 mb-6 leading-relaxed">
              نظام فاراماس هو الحل السحابي الأول لإدارة الصيدليات. نعمل على
              تبسيط عملياتك، تقليل الهدر المالي، وزيادة الأرباح عبر أحدث
              التقنيات.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-colors"
              >
                <Facebook size={20} />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-colors"
              >
                <Twitter size={20} />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-colors"
              >
                <Instagram size={20} />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-colors"
              >
                <Linkedin size={20} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6 relative inline-block">
              روابط سريعة
              <span className="absolute bottom-0 right-0 w-1/2 h-1 bg-primary-600 rounded-full -mb-2"></span>
            </h3>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                  الرئيسية
                </Link>
              </li>
              <li>
                <Link
                  href="/features"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                  مميزات النظام
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                  باقات الاشتراك
                </Link>
              </li>
              <li>
                <Link
                  href="/download"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                  تحميل التطبيقات
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>

          {/* Platform Links */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6 relative inline-block">
              الأنظمة المدعومة
              <span className="absolute bottom-0 right-0 w-1/2 h-1 bg-primary-600 rounded-full -mb-2"></span>
            </h3>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/features#web"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                  لوحة تحكم الويب (للإدارة)
                </Link>
              </li>
              <li>
                <Link
                  href="/features#mobile"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                  تطبيق الهاتف (للإدارة والمتابعة)
                </Link>
              </li>
              <li>
                <Link
                  href="/features#desktop"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                  برنامج سطح المكتب (POS)
                </Link>
              </li>
              <li>
                <Link
                  href="/features#offline"
                  className="hover:text-primary-400 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                  مزامنة Offline
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6 relative inline-block">
              معلومات الاتصال
              <span className="absolute bottom-0 right-0 w-1/2 h-1 bg-primary-600 rounded-full -mb-2"></span>
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="text-primary-500 mt-1 shrink-0" size={20} />
                <span>
                  بغداد، العراق
                  <br />
                  الدورة , شارع ابو طيارة
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="text-primary-500 shrink-0" size={20} />
                <span dir="ltr" className="text-right">
                  07857581997
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="text-primary-500 shrink-0" size={20} />
                <a
                  href="mailto:info@faramace.com"
                  className="hover:text-white transition-colors"
                >
                  info@faramace.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>
            © {currentYear} شركة فاراماس للحلول البرمجية. جميع الحقوق محفوظة.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              سياسة الخصوصية
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              شروط الاستخدام
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
