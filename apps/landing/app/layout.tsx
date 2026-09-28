import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

import dynamic from 'next/dynamic';
import Navbar from '../components/navbar';

const Footer = dynamic(() => import('../components/footer'));
const WhatsAppButton = dynamic(() => import('../components/whatsapp-button'));

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://faramace.vercel.app'),
  title: 'فاراماس | نظام إدارة الصيدليات وربطها بالمذاخر',
  description:
    'فاراماس نظام متكامل للصيدليات: كاشير يعمل دون إنترنت، لوحة إدارة سحابية، تطبيق جوال، وشبكة تربط الصيدليات بالمذاخر من الطلب حتى فاتورة الشراء.',
  keywords: 'صيدلية, إدارة صيدليات, برنامج كاشير, مذاخر أدوية, نظام سحابي, العراق, نقاط بيع, فاراماس, Faramace',
  authors: [{ name: 'Faramace' }],
  openGraph: {
    title: 'فاراماس | نظام إدارة الصيدليات وربطها بالمذاخر',
    description: 'كاشير يعمل دون إنترنت، لوحة إدارة سحابية، تطبيق جوال، وشبكة مذاخر في نظام واحد.',
    locale: 'ar_IQ',
    type: 'website',
    images: ['/og-image.jpg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#031413',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="font-cairo bg-white text-slate-700 antialiased min-h-screen flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-primary-700 focus:shadow-lift">
          تخطَّ إلى المحتوى
        </a>
        <Navbar />
        <div id="main" className="flex flex-grow flex-col">{children}</div>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
