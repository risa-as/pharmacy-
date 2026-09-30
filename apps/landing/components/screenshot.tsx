import Image from 'next/image';
import { BrowserFrame } from './mockups';

/*
 * Real screens of the system, captured from a demo account filled with fictional data
 * («صيدلية التفوق»، «مذخر التفوق»). Never a customer's account.
 */
export const shots = {
  dashboard: { src: '/shots/web-dashboard.webp', width: 1800, height: 1125, alt: 'لوحة تحكم صيدلية التفوق: مبيعات اليوم وصافي الربح وتنبيهات النقص والانتهاء' },
  batches: { src: '/shots/web-batches.webp', width: 1600, height: 1218, alt: 'شاشة إدارة الدفعات: كل دفعة بموردها وكميتها وتاريخ انتهائها' },
  batchesDetail: { src: '/shots/web-batches-detail.webp', width: 1400, height: 353, alt: 'تكبير من جدول الدفعات: دفعتان قريبتا الانتهاء ودفعة منتهية بكمياتها وتواريخها' },
  // Phones: the same web app at phone width.
  phoneDashboard: { src: '/shots/phone-web-dashboard.webp', width: 780, height: 1060, alt: 'لوحة التحكم على متصفح الهاتف: مبيعات اليوم ومشترياته' },
  phoneExpiryAlerts: { src: '/shots/phone-web-expiry-alerts.webp', width: 780, height: 808, alt: 'تنبيهات قرب الانتهاء على متصفح الهاتف: اسم الدواء والفرع وعدد الأيام المتبقية' },
  pos: { src: '/shots/web-pos.webp', width: 1800, height: 1125, alt: 'شاشة نقطة البيع' },
  warehouseOrders: { src: '/shots/web-warehouse-orders.webp', width: 1800, height: 1125, alt: 'طلبات المذاخر من جهة الصيدلية' },
  portalOrders: { src: '/shots/portal-orders.webp', width: 1800, height: 1125, alt: 'بوابة المذخر: الطلبات الواردة من الصيدليات' },
} as const;

type Shot = (typeof shots)[keyof typeof shots];

export function ScreenImage({ shot, priority = false, sizes = '(min-width: 1024px) 1100px, 100vw', className = '' }: { shot: Shot; priority?: boolean; sizes?: string; className?: string }) {
  return (
    <Image
      src={shot.src}
      width={shot.width}
      height={shot.height}
      alt={shot.alt}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      className={`block h-auto w-full ${className}`}
    />
  );
}

export function BrowserShot({ shot, priority, sizes, className = '', url }: { shot: Shot; priority?: boolean; sizes?: string; className?: string; url?: string }) {
  return (
    <BrowserFrame className={className} url={url}>
      <ScreenImage shot={shot} priority={priority} sizes={sizes} />
    </BrowserFrame>
  );
}
