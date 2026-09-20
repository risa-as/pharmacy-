'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, BellOff, Check, X } from 'lucide-react';

// createdAt يعود فعلاً من /api/notifications/in-app (لا select في الاستعلام،
// فالسجل كامل)، وكان النوع هنا يُسقطه فقط — فأُضيف لعرض «قبل ٥ دقائق».
type Notice = { id: string; title: string; body: string; isRead: boolean; createdAt: string };

const relativeFormatter = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });

/** «قبل ٣ ساعات» — أكبر وحدة مناسبة، بلا مكتبة تواريخ. */
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const seconds = Math.round((then - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    if (abs < 60) return relativeFormatter.format(seconds, 'second');
    if (abs < 3_600) return relativeFormatter.format(Math.round(seconds / 60), 'minute');
    if (abs < 86_400) return relativeFormatter.format(Math.round(seconds / 3_600), 'hour');
    if (abs < 2_592_000) return relativeFormatter.format(Math.round(seconds / 86_400), 'day');
    if (abs < 31_536_000) return relativeFormatter.format(Math.round(seconds / 2_592_000), 'month');
    return relativeFormatter.format(Math.round(seconds / 31_536_000), 'year');
}

export default function WarehouseNotifications({ portal = false }: { portal?: boolean }) {
    const [items, setItems] = useState<Notice[]>([]);
    const [count, setCount] = useState(0);
    const [open, setOpen] = useState(false);
    // قبل هذا كانت اللوحة تُظهر «لا توجد تنبيهات» أثناء أول جلب، فتكذب على
    // المستخدم لثوانٍ. الآن هيكل تحميل حتى تعود أول استجابة.
    const [loading, setLoading] = useState(true);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let disposed = false;
        let pending = false;
        const abort = new AbortController();
        const refresh = async () => {
            if (pending || document.visibilityState !== 'visible') return;
            pending = true;
            try {
                const response = await fetch('/api/notifications/in-app?kind=WAREHOUSE_ORDER', { cache: 'no-store', signal: abort.signal });
                if (!response.ok) return;
                const data = await response.json();
                if (!disposed) { setItems(data.notifications ?? []); setCount(data.unreadCount ?? 0); }
            } catch { /* Keep last known notifications during network loss. */ }
            finally { pending = false; if (!disposed) setLoading(false); }
        };
        void refresh();
        const timer = setInterval(() => void refresh(), 30_000);
        const onFocus = () => void refresh();
        window.addEventListener('focus', onFocus);
        return () => { disposed = true; abort.abort(); clearInterval(timer); window.removeEventListener('focus', onFocus); };
    }, []);

    // إغلاق باللمس خارج اللوحة أو بمفتاح Escape — كانت اللوحة تُغلق بزرّ «إغلاق»
    // نصيّ فقط، فتبقى مفتوحة فوق المحتوى عند النقر في أي مكان آخر.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const markRead = async (id: string) => {
        try {
            const res = await fetch('/api/notifications/in-app', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
            if (res.ok) {
                setItems((prev) => prev.map((item) => item.id === id ? { ...item, isRead: true } : item));
                setCount((prev) => Math.max(0, prev - 1));
            }
        } catch { /* It remains unread and can be retried. */ }
    };

    // تُرسل المعرّفات صراحةً لا { all: true }: خيار `all` في الـAPI يُعلّم كل
    // تنبيهات المستخدم مقروءةً بلا تمييز نوع، وهذه اللوحة تخصّ المذاخر وحدها
    // فكان سيطفئ تنبيهات أنواع أخرى لم يرها المستخدم.
    const markAllRead = async () => {
        const ids = items.filter((item) => !item.isRead).map((item) => item.id);
        if (!ids.length) return;
        try {
            const res = await fetch('/api/notifications/in-app', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
            if (res.ok) {
                setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
                setCount((prev) => Math.max(0, prev - ids.length));
            }
        } catch { /* They remain unread and can be retried. */ }
    };

    const ordersHref = portal ? '/warehouse/orders' : '/dashboard/purchases/warehouse-orders';

    return <div ref={rootRef} className="relative print:hidden" dir="rtl">
        <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="true"
            aria-label={`تنبيهات المذاخر: ${count} غير مقروءة`}
            className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-bold transition-colors ${
                open ? 'border-border bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
        >
            <Bell className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden sm:inline">تنبيهات المذاخر</span>
            {count > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold tabular-nums text-primary-foreground">
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </button>

        {open && (
            <div className="absolute left-0 z-50 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-lg border bg-card shadow-lg">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground">تنبيهات المذاخر</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {count > 0 ? `${count} غير مقروءة` : 'لا جديد'}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {count > 0 && (
                            <button
                                type="button"
                                onClick={() => void markAllRead()}
                                className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <Check className="h-3.5 w-3.5" /> تحديد الكل كمقروء
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="إغلاق"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* بوابة المذاخر تُصيّر هذه اللوحة داخل <main> يحمل overflow-x-hidden
                    (app/warehouse/layout.tsx:129-130)، وحين لا يكون أحد المحورين
                    visible يحسب المتصفح المحور الآخر auto — أي أن اللوحة تُقصّ
                    عمودياً هناك. الحدّ min(20rem,50vh) يُبقي مجموع ارتفاع اللوحة
                    قريباً من السابق (max-h-96) وآمناً على الشاشات القصيرة. */}
                <div className="max-h-[min(20rem,50vh)] divide-y overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loading && Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="flex gap-2.5 px-3 py-3">
                            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 w-2/5 rounded bg-muted" />
                                <div className="h-3 w-4/5 rounded bg-muted" />
                            </div>
                        </div>
                    ))}

                    {!loading && !items.length && (
                        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                <BellOff className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <p className="text-[13px] font-bold text-foreground">لا توجد تنبيهات</p>
                            <p className="text-[11px] text-muted-foreground">
                                ستظهر هنا تحديثات طلبات المذاخر: العروض، الشحن، والاستلام.
                            </p>
                        </div>
                    )}

                    {!loading && items.map((item) => (
                        // الصف كله رابط: كان لكل تنبيه رابط «فتح الطلبات» تحته
                        // بخطّ سفليّ، فيتكرّر النصّ في كل صف ومساحة النقر ضيقة.
                        <Link
                            key={item.id}
                            href={ordersHref}
                            onClick={() => { if (!item.isRead) void markRead(item.id); setOpen(false); }}
                            className={`flex gap-2.5 px-3 py-3 transition-colors hover:bg-muted/60 ${item.isRead ? '' : 'bg-primary/[0.04]'}`}
                        >
                            {/* نقطة «غير مقروء»؛ ويبقى مكانها محفوظاً في المقروء
                                حتى لا يتزحزح النصّ بين الصفوف. */}
                            <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-transparent' : 'bg-primary'}`}
                                aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                                <p className={`truncate text-[13px] ${item.isRead ? 'font-semibold text-muted-foreground' : 'font-bold text-foreground'}`}>
                                    {item.title}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                    {item.body}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground/70">
                                    {relativeTime(item.createdAt)}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>

                <Link
                    href={ordersHref}
                    onClick={() => setOpen(false)}
                    className="flex h-10 items-center justify-center border-t text-[12px] font-bold text-primary transition-colors hover:bg-muted"
                >
                    عرض كل طلبات المذاخر
                </Link>
            </div>
        )}
    </div>;
}
