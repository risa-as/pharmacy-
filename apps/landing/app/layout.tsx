import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

import dynamic from 'next/dynamic';
import Navbar from '../components/navbar';

const Footer = dynamic(() => import('../components/footer'));
const WhatsAppButton = dynamic(() => import('../components/whatsapp-button'), { ssr: false });

const cairo = Cairo({ 
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-cairo',
});

export const metadata: Metadata = {
  title: 'فاراماس | النظام السحابي الأول لإدارة الصيدليات',
  description: 'نظام فاراماس هو الحل المتكامل لإدارة صيدليتك. يجمع بين لوحة تحكم سحابية، تطبيق للموبايل، وبرنامج كاشير يعمل بدون إنترنت.',
  keywords: 'صيدلية, إدارة صيدليات, برنامج كاشير, نظام سحابي, العراق, نقاط بيع, فاراماس, Faramace',
  authors: [{ name: 'Faramace Team' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable}`}>
      <body className="font-cairo bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 antialiased min-h-screen flex flex-col transition-colors duration-300">
        <Navbar />
        {children}
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
