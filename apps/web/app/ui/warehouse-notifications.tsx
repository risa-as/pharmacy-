'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

type Notice = { id: string; title: string; body: string; isRead: boolean };

export default function WarehouseNotifications({ portal = false }: { portal?: boolean }) {
    const [items, setItems] = useState<Notice[]>([]);
    const [count, setCount] = useState(0);
    const [open, setOpen] = useState(false);
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
            finally { pending = false; }
        };
        void refresh();
        const timer = setInterval(() => void refresh(), 30_000);
        const onFocus = () => void refresh();
        window.addEventListener('focus', onFocus);
        return () => { disposed = true; abort.abort(); clearInterval(timer); window.removeEventListener('focus', onFocus); };
    }, []);
    const markRead = async (id: string) => {
        try {
            const res = await fetch('/api/notifications/in-app', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
            if (res.ok) {
                setItems((prev) => prev.map((item) => item.id === id ? { ...item, isRead: true } : item));
                setCount((prev) => Math.max(0, prev - 1));
            }
        } catch { /* It remains unread and can be retried. */ }
    };
    return <div className="relative print:hidden" dir="rtl">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`تنبيهات المذاخر: ${count} غير مقروءة`} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Bell size={18} /> تنبيهات المذاخر {count > 0 && <span className="rounded-full bg-primary px-2 text-primary-foreground">{count}</span>}
        </button>
        {open && <div className="absolute left-0 z-50 mt-2 max-h-96 w-80 max-w-[90vw] overflow-auto rounded-lg border bg-card p-3 shadow-lg">
            <button className="mb-2 text-sm underline" onClick={() => setOpen(false)}>إغلاق</button>
            {!items.length && <p className="p-2 text-sm text-muted-foreground">لا توجد تنبيهات مذاخر حتى الآن.</p>}
            {items.map((item) => <div key={item.id} className={`border-b p-2 text-sm ${item.isRead ? 'opacity-70' : ''}`}>
                <p className="font-semibold">{item.title}</p><p>{item.body}</p>
                <Link className="inline-block py-2 text-primary underline" href={portal ? '/warehouse/orders' : '/dashboard/purchases/warehouse-orders'} onClick={() => { if (!item.isRead) void markRead(item.id); setOpen(false); }}>فتح الطلبات</Link>
            </div>)}
        </div>}
    </div>;
}
