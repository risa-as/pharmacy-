import Image from "next/image";
import { BrowserFrame } from "./browser-frame";

/*
 * Real screens of the system, captured from a demo account filled with fictional data
 * («صيدلية التفوق»، «مذخر التفوق»). Never a customer's account.
 */
export const shots = {
  smartPurchasing: {
    src: "/shots/web-smart-purchasing.webp",
    width: 1800,
    height: 1438,
    alt: "شاشة الشراء الذكي الفعلية: فترة التحليل ومدة التغطية والكميات المقترحة",
  },
  desktop: {
    src: "/shots/desktop-pos.webp",
    width: 1800,
    height: 1094,
    alt: "تطبيق فاراماس على Windows: نقطة البيع ببيانات صيدلية عرض",
  },
  mobile: {
    src: "/shots/android-home.webp",
    width: 1080,
    height: 2400,
    alt: "تطبيق فاراماس الأصلي على Android: الصفحة الرئيسية لصيدلية العرض",
  },
  mobilePlanning: {
    src: "/shots/android-smart-order.webp",
    width: 1080,
    height: 2400,
    alt: "شاشة الطلب الذكي في تطبيق فاراماس الأصلي على Android",
  },
  dashboard: {
    src: "/shots/web-dashboard-20261001.webp",
    width: 2400,
    height: 1600,
    quality: 90,
    alt: "التصميم الحالي للصفحة الرئيسية: تنبيهات الصيدلية والمبيعات وصافي الربح ومخطط الأداء",
  },
  batches: {
    src: "/shots/web-batches.webp",
    width: 1600,
    height: 1218,
    alt: "شاشة إدارة الدفعات: كل دفعة بموردها وكميتها وتاريخ انتهائها",
  },
  batchesDetail: {
    src: "/shots/web-batches-detail.webp",
    width: 1400,
    height: 353,
    alt: "تكبير من جدول الدفعات: دفعتان قريبتا الانتهاء ودفعة منتهية بكمياتها وتواريخها",
  },
  // Phones: the same web app at phone width.
  phoneDashboard: {
    src: "/shots/phone-web-dashboard.webp",
    width: 780,
    height: 1060,
    alt: "لوحة التحكم على متصفح الهاتف: مبيعات اليوم ومشترياته",
  },
  phoneExpiryAlerts: {
    src: "/shots/phone-web-expiry-alerts.webp",
    width: 780,
    height: 808,
    alt: "تنبيهات قرب الانتهاء على متصفح الهاتف: اسم الدواء والفرع وعدد الأيام المتبقية",
  },
  pos: {
    src: "/shots/web-pos.webp",
    width: 1800,
    height: 1125,
    alt: "شاشة نقطة البيع",
  },
  warehouseOrders: {
    src: "/shots/web-warehouse-orders.webp",
    width: 1800,
    height: 1125,
    alt: "طلبات المذاخر من جهة الصيدلية",
  },
  portalOrders: {
    src: "/shots/portal-orders.webp",
    width: 1800,
    height: 1125,
    alt: "بوابة المذخر: الطلبات الواردة من الصيدليات",
  },
} as const;

type Shot = (typeof shots)[keyof typeof shots];

export function ScreenImage({
  shot,
  priority = false,
  sizes = "(min-width: 1024px) 1100px, 100vw",
  className = "",
}: {
  shot: Shot;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <Image
      src={shot.src}
      width={shot.width}
      height={shot.height}
      alt={shot.alt}
      quality={"quality" in shot ? shot.quality : 75}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      className={`block h-auto w-full ${className}`}
    />
  );
}

export function BrowserShot({
  shot,
  priority,
  sizes,
  className = "",
  url,
}: {
  shot: Shot;
  priority?: boolean;
  sizes?: string;
  className?: string;
  url?: string;
}) {
  return (
    <BrowserFrame className={className} url={url}>
      <ScreenImage shot={shot} priority={priority} sizes={sizes} />
    </BrowserFrame>
  );
}

export function PhoneShot({
  shot = shots.mobile,
  className = "",
  priority = false,
}: {
  shot?: Shot;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure
      className={`overflow-hidden rounded-[2.2rem] border-[6px] border-slate-900 bg-slate-900 shadow-lift ${className}`}
    >
      <ScreenImage
        shot={shot}
        priority={priority}
        sizes="(max-width: 640px) 260px, 300px"
      />
    </figure>
  );
}
export function DesktopShot({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lift ${className}`}
    >
      <ScreenImage shot={shots.desktop} />
    </figure>
  );
}
