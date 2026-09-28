import Image from 'next/image';
import { ReactNode } from 'react';
import {
  LayoutGrid, ShoppingCart, Package, Truck, BarChart3, Wallet, Bell, AlertTriangle,
  CheckCircle2, CircleSlash, CircleDashed, Home, Boxes, FileText,
} from 'lucide-react';

/*
 * Illustrations of the product drawn in code with clearly fictional demo data
 * («صيدلية النموذج»، «مذخر النموذج»). Real screenshots of customer accounts are never
 * used on the public site.
 */

export function BrowserFrame({ children, url = 'app.faramace.com', className = '' }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/10 shadow-lift ${className}`}>
      <div className="flex h-9 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3" dir="ltr">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200">{url}</span>
      </div>
      {children}
    </div>
  );
}

const kpis = [
  { label: 'مبيعات اليوم', value: '1,284,000', note: '86 فاتورة', icon: <ShoppingCart size={14} /> },
  { label: 'صافي اليوم', value: '312,500', note: 'بعد المصروفات', icon: <BarChart3 size={14} /> },
  { label: 'نواقص', value: '14', note: 'تحت حد الطلب', icon: <AlertTriangle size={14} />, warn: true },
];
const bars = [38, 52, 44, 61, 57, 72, 66, 80, 74, 88, 69, 92];

export function DashboardMockup({ className = '' }: { className?: string }) {
  return (
    <BrowserFrame className={className}>
      <div className="flex h-full min-h-[320px] bg-slate-50 text-[11px]">
        <aside className="hidden w-40 shrink-0 flex-col gap-1 border-s border-slate-200 bg-white p-3 sm:flex">
          <div className="mb-3 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 p-3 text-white">
            <p className="font-extrabold">صيدلية النموذج</p>
            <p className="text-[9px] text-primary-100">حساب تجريبي</p>
          </div>
          {[
            [<LayoutGrid key="i" size={13} />, 'الرئيسية', true],
            [<ShoppingCart key="i" size={13} />, 'المبيعات', false],
            [<Package key="i" size={13} />, 'المخزون والدفعات', false],
            [<Truck key="i" size={13} />, 'الموردون والمذاخر', false],
            [<Wallet key="i" size={13} />, 'الصناديق', false],
            [<BarChart3 key="i" size={13} />, 'التقارير', false],
          ].map(([icon, label, active]) => (
            <div key={label as string} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold ${active ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}>
              {icon}
              {label}
            </div>
          ))}
        </aside>
        <div className="flex-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-900">لوحة التحكم</p>
              <p className="text-[10px] text-slate-400">ملخص اليوم لكل الفروع</p>
            </div>
            <span className="rounded-md bg-white px-2 py-1 text-[10px] text-slate-500 ring-1 ring-slate-200">اليوم</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {kpis.map((k) => (
              <div key={k.label} className={`rounded-xl bg-white p-2.5 ring-1 ${k.warn ? 'ring-amber-200' : 'ring-slate-200'}`}>
                <div className="flex items-center justify-between text-slate-400">
                  <span>{k.label}</span>
                  <span className={k.warn ? 'text-amber-500' : 'text-primary-600'}>{k.icon}</span>
                </div>
                <p className="mt-1 text-sm font-black text-slate-900" dir="ltr">{k.value}</p>
                <p className="text-[9px] text-slate-400">{k.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="mb-2 font-bold text-slate-700">المبيعات خلال السنة</p>
            <div className="flex h-24 items-end gap-1.5" dir="ltr">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary-700 to-primary-400" style={{ height: `${h}%`, opacity: 0.55 + i * 0.035 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function PhoneMockup({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-[210px] rounded-[2.4rem] bg-slate-900 p-2 shadow-lift ring-1 ring-slate-900/20 ${className}`}>
      <div className="absolute inset-x-0 top-2 z-10 mx-auto h-5 w-20 rounded-b-2xl bg-slate-900" />
      <div className="overflow-hidden rounded-[2rem] bg-slate-50 text-[10px]">
        <div className="bg-white px-4 pb-3 pt-7">
          <p className="text-[9px] text-slate-400">صيدلية النموذج</p>
          <p className="text-sm font-black text-slate-900">أهلاً بك</p>
        </div>
        <div className="m-3 rounded-2xl bg-gradient-to-br from-primary-700 to-primary-900 p-3 text-white">
          <p className="text-[9px] text-primary-100">إجمالي مبيعات اليوم</p>
          <p className="mt-1 text-xl font-black" dir="ltr">1,284,000</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {[['86', 'فاتورة'], ['9', 'تنبيه'], ['3', 'ديون']].map(([n, l]) => (
              <div key={l} className="rounded-lg bg-white/10 py-1.5">
                <p className="text-xs font-black">{n}</p>
                <p className="text-[8px] text-primary-100">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 ring-1 ring-amber-200">
          <AlertTriangle size={14} className="shrink-0 text-amber-600" />
          <div>
            <p className="font-bold text-slate-800">14 صنفاً تحت حد الطلب</p>
            <p className="text-[8px] text-slate-500">أرسلها لمذخر بضغطة</p>
          </div>
        </div>
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
          <Bell size={14} className="shrink-0 text-primary-600" />
          <p className="font-bold text-slate-700">عرض سعر جديد من مذخر النموذج</p>
        </div>
        <div className="flex justify-around border-t border-slate-200 bg-white py-2 text-slate-400">
          <Home size={14} className="text-primary-700" />
          <Boxes size={14} />
          <FileText size={14} />
          <BarChart3 size={14} />
        </div>
      </div>
    </div>
  );
}

/** Real point-of-sale screenshot (demo data only: sample drugs and a sample cashier). */
export function PosShot({ className = '', priority = false }: { className?: string; priority?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-slate-900 p-1.5 shadow-lift ring-1 ring-slate-900/20 ${className}`}>
      <div className="relative aspect-[2/1] overflow-hidden rounded-xl bg-white">
        <Image src="/images/pos-screen.png" alt="شاشة البيع في برنامج فاراماس لسطح المكتب" fill sizes="(max-width: 1024px) 100vw, 640px" className="object-cover object-top" priority={priority} />
      </div>
    </div>
  );
}

const quoteLines = [
  { name: 'Augmentin 1g', qty: '40', final: '40', price: '11,500', state: 'available' as const },
  { name: 'Panadol Extra', qty: '120', final: '80', price: '2,250', state: 'partial' as const },
  { name: 'Ventolin Inhaler', qty: '30', final: '—', price: '—', state: 'out' as const },
  { name: 'Nexium 40', qty: '25', final: '25', price: '17,000', state: 'available' as const },
];
const stateStyle = {
  available: { label: 'متوفر', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <CheckCircle2 size={11} /> },
  partial: { label: 'جزئي', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: <CircleDashed size={11} /> },
  out: { label: 'نافد', cls: 'bg-rose-50 text-rose-700 ring-rose-200', icon: <CircleSlash size={11} /> },
};

/** The warehouse portal's quoting screen: each line priced and marked available / partial / out. */
export function WarehouseQuoteMockup({ className = '' }: { className?: string }) {
  return (
    <BrowserFrame url="app.faramace.com/warehouse/orders" className={className}>
      <div className="bg-slate-50 p-4 text-[11px]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-slate-900">طلب ‎#WO-1042 — صيدلية النموذج</p>
            <p className="text-[10px] text-slate-400">مذخر النموذج · قيد المراجعة</p>
          </div>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 font-bold text-sky-700 ring-1 ring-sky-200">قيد المراجعة</span>
        </div>
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          <div className="grid grid-cols-[1.6fr_.6fr_.6fr_.9fr_.9fr] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 font-bold text-slate-500">
            <span>الصنف</span><span>المطلوب</span><span>المؤكد</span><span>السعر</span><span>الحالة</span>
          </div>
          {quoteLines.map((l) => {
            const s = stateStyle[l.state];
            return (
              <div key={l.name} className="grid grid-cols-[1.6fr_.6fr_.6fr_.9fr_.9fr] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                <span className="font-bold text-slate-800" dir="ltr">{l.name}</span>
                <span className="text-slate-500">{l.qty}</span>
                <span className="font-bold text-slate-800">{l.final}</span>
                <span className="text-slate-700" dir="ltr">{l.price}</span>
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-bold ring-1 ${s.cls}`}>{s.icon}{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div>
            <p className="text-[10px] text-slate-400">إجمالي العرض</p>
            <p className="text-sm font-black text-slate-900" dir="ltr">1,065,000 IQD</p>
          </div>
          <span className="rounded-lg bg-primary-700 px-3 py-1.5 font-bold text-white">إرسال العرض للصيدلية</span>
        </div>
      </div>
    </BrowserFrame>
  );
}
