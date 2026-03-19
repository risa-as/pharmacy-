import Link from 'next/link';
import { Home, AlertCircle } from 'lucide-react';
import CTAButton from '../components/cta-button';

export default function NotFound() {
  return (
    <main className="flex-grow flex items-center justify-center py-32 bg-slate-50 min-h-screen">
      <div className="container mx-auto px-4 text-center">
        <div className="w-24 h-24 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 relative">
          <AlertCircle size={48} />
          <div className="absolute top-0 right-0 w-6 h-6 bg-accent rounded-full animate-ping"></div>
        </div>
        
        <h1 className="text-7xl font-black text-slate-900 mb-4 tracking-tighter">404</h1>
        <h2 className="text-3xl font-bold text-slate-800 mb-6">عذراً، الصفحة غير موجودة</h2>
        <p className="text-lg text-slate-600 max-w-xl mx-auto mb-10 leading-relaxed">
          يبدو أنك تحاول الوصول إلى صفحة غير موجودة أو تم نقلها. يمكنك العودة إلى الصفحة الرئيسية لمواصلة تصفح الموقع.
        </p>
        
        <div className="flex justify-center">
          <CTAButton href="/" variant="primary" size="lg">
            <Home className="ml-2" size={20} />
            العودة للرئيسية
          </CTAButton>
        </div>
      </div>
    </main>
  );
}
