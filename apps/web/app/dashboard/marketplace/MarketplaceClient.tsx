'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Search, ShoppingCart, Plus, Tag, Package } from 'lucide-react';
import {
    PurchaseAttempt, AttemptOutcome, loadAttempts, addAttempt, removeAttempt, sendAttempt, checkAttempt,
    shouldResend, isAttemptStorageKey,
} from './purchase-attempts';

const PENDING_TEXT: Record<string, string> = {
    processing: 'قيد المعالجة على الخادم',
    unknown: 'لم يصل إلى الخادم بعد؛ يمكن إعادة الإرسال بأمان',
    auth: 'انتهت الجلسة؛ سجّل الدخول ثم تحقق',
    scope: 'الفرع الذي أُنشئ منه الطلب لم يعد ضمن نطاقك؛ لم يُرسل باسم فرع آخر',
    server: 'تعذّر التأكد من النتيجة',
    network: 'انقطع الاتصال قبل التأكد من النتيجة',
};

export default function MarketplaceClient() {
    const [listings, setListings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showSellForm, setShowSellForm] = useState(false);
    const [sellForm, setSellForm] = useState({ drugId: '', quantity: '', unitPrice: '', description: '', expiryDate: '', batchNumber: '' });
    const [message, setMessage] = useState('');

    const fetchListings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/marketplace?search=${search}`);
            const data = await res.json();
            setListings(data.listings || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [search]);

    useEffect(() => { fetchListings(); }, [fetchListings]);

    const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + ' د.ع';

    // Purchase attempts (see purchase-attempts.ts): stored per user, shared by
    // every tab, settled only by the server.
    const { data: session } = useSession();
    const userId = (session?.user as any)?.id as string | undefined;
    const [attempts, setAttempts] = useState<PurchaseAttempt[]>([]);
    const [busy, setBusy] = useState<Record<string, boolean>>({});
    const [pendingReason, setPendingReason] = useState<Record<string, string>>({});

    const reload = useCallback(() => setAttempts(userId ? loadAttempts(userId) : []), [userId]);

    const apply = useCallback((attempt: PurchaseAttempt, outcome: AttemptOutcome) => {
        if (!userId) return;
        if (outcome.kind === 'succeeded') {
            removeAttempt(userId, attempt.key);
            setMessage(`✅ تم طلب ${attempt.label}`);
            fetchListings();
        } else if (outcome.kind === 'rejected') {
            removeAttempt(userId, attempt.key);
            setMessage(`❌ لم يُنفَّذ طلب ${attempt.label}: ${outcome.error}`);
        } else {
            setPendingReason(r => ({ ...r, [attempt.key]: outcome.reason }));
            setMessage(`⏳ ${attempt.label}: ${PENDING_TEXT[outcome.reason]}. لن يُكرَّر الطلب عند إعادة المحاولة.`);
        }
        reload();
    }, [userId, fetchListings, reload]);

    // Ask the server for the outcome. UNKNOWN (never received) and PROCESSING are
    // resent as the SAME attempt; the server decides (202 again, or it takes over
    // an abandoned attempt and executes it once).
    const verify = useCallback(async (attempt: PurchaseAttempt, resendIfUnknown: boolean) => {
        setBusy(b => ({ ...b, [attempt.key]: true }));
        try {
            let outcome = await checkAttempt(attempt.key);
            if (resendIfUnknown && shouldResend(outcome)) outcome = await sendAttempt(attempt);
            apply(attempt, outcome);
        } finally { setBusy(b => ({ ...b, [attempt.key]: false })); }
    }, [apply]);

    useEffect(() => {
        if (!userId) { setAttempts([]); return; }
        reload();
        // Re-check pending attempts on load, on return to the tab, and when back online.
        const recheck = () => loadAttempts(userId).forEach(a => { void verify(a, false); });
        recheck();
        const onStorage = (e: StorageEvent) => { if (isAttemptStorageKey(e.key)) reload(); };
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', recheck);
        window.addEventListener('online', recheck);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', recheck);
            window.removeEventListener('online', recheck);
        };
    }, [userId, reload, verify]);

    const buyItem = async (listing: any, qty: number) => {
        if (!userId) return;
        // The buying branch is pinned now; a later branch change must not re-target it.
        const branchId = (session?.user as any)?.branchId as string | undefined;
        if (!branchId) { setMessage('❌ لا يوجد فرع مرتبط بحسابك للشراء منه.'); return; }
        // Every click on "buy" is a NEW purchase intent. If one for this listing is
        // still unresolved, buying again must be a deliberate choice.
        const open = loadAttempts(userId).filter(a => a.listingId === listing.id);
        if (open.length > 0 && !window.confirm('لديك طلب شراء لهذا العرض لم تُحسم نتيجته بعد. هل تريد إنشاء طلب شراء جديد إضافي؟')) return;
        const attempt: PurchaseAttempt = {
            key: crypto.randomUUID(), listingId: listing.id, quantity: qty,
            label: `${listing.drug?.tradeName ?? 'صنف'} × ${qty}`, createdAt: new Date().toISOString(),
            organizationId: ((session?.user as any)?.organizationId as string | null) ?? null, branchId,
        };
        // Stored and read back BEFORE sending. Without a stored attempt a lost reply
        // cannot be followed, the button would stay enabled, and a second click
        // would create a NEW key and possibly a second order. So: no storage, no send.
        if (!addAttempt(userId, attempt)) {
            setMessage('❌ لم يُرسل الطلب: تعذّر حفظ متابعة الطلب في المتصفح (التخزين غير متاح أو ممتلئ). اخرج من وضع التصفح الخاص أو أفرغ مساحة في المتصفح ثم أعد المحاولة.');
            return;
        }
        reload();
        setBusy(b => ({ ...b, [attempt.key]: true }));
        try { apply(attempt, await sendAttempt(attempt)); }
        finally { setBusy(b => ({ ...b, [attempt.key]: false })); }
    };

    const dismiss = (attempt: PurchaseAttempt) => {
        if (!userId || !window.confirm('إزالة هذا الطلب من المتابعة؟ لن يُلغى إن كان قد نُفّذ على الخادم.')) return;
        removeAttempt(userId, attempt.key);
        reload();
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">🏪 Faramace Store - سوق B2B</h1>
                <button onClick={() => setShowSellForm(!showSellForm)}
                    className="flex items-center gap-1 px-4 py-2 bg-info text-info-foreground rounded-lg text-sm hover:bg-info/90">
                    <Plus className="w-4 h-4" /> عرض للبيع
                </button>
            </div>

            {message && (
                <div className="p-3 rounded-lg bg-muted text-sm text-center" data-testid="marketplace-message">{message}</div>
            )}

            {attempts.length > 0 && (
                <div className="bg-card rounded-xl border p-4 space-y-2" data-testid="pending-attempts">
                    <div className="text-sm font-bold text-foreground">طلبات شراء لم تُحسم نتيجتها</div>
                    {attempts.map(a => (
                        <div key={a.key} className="flex items-center justify-between gap-2 text-sm border-t pt-2" data-attempt-key={a.key}>
                            <div>
                                <div className="text-foreground">{a.label}</div>
                                <div className="text-xs text-muted-foreground">{PENDING_TEXT[pendingReason[a.key] ?? 'server']}</div>
                            </div>
                            <div className="flex gap-2">
                                <button disabled={busy[a.key]} onClick={() => verify(a, true)}
                                    className="px-3 py-1 rounded-lg bg-info text-info-foreground text-xs disabled:opacity-50">
                                    {busy[a.key] ? 'جارٍ التحقق…' : 'تحقق / أعد المحاولة'}
                                </button>
                                <button disabled={busy[a.key]} onClick={() => dismiss(a)}
                                    className="px-3 py-1 rounded-lg border text-xs disabled:opacity-50">إزالة</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Search */}
            <div className="bg-card rounded-xl shadow-sm border p-4">
                <div className="relative">
                    <Search className="w-4 h-4 absolute right-3 top-2.5 text-muted-foreground" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="ابحث عن دواء في السوق..."
                        className="w-full border rounded-lg pr-9 pl-3 py-2 text-sm bg-muted"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
                </div>
            ) : listings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {listings.map((listing: any) => (
                        <div key={listing.id} className="bg-card rounded-xl border shadow-sm p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-foreground">{listing.drug?.tradeName}</h3>
                                <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">متوفر</span>
                            </div>
                            <div className="space-y-1.5 text-sm text-muted-foreground mb-3">
                                {listing.drug?.scientificName && (
                                    <div className="text-xs text-muted-foreground">{listing.drug.scientificName}</div>
                                )}
                                <div className="flex items-center gap-1"><Tag className="w-3 h-3" /> {listing.drug?.barcode}</div>
                                <div className="flex items-center gap-1"><Package className="w-3 h-3" /> {listing.quantity} وحدة متاحة</div>
                                <div className="text-xs text-muted-foreground">البائع: {listing.seller?.name}</div>
                                {listing.batchNumber && <div className="text-xs text-muted-foreground">دفعة: {listing.batchNumber}</div>}
                            </div>
                            <div className="flex items-center justify-between border-t pt-3">
                                <div className="text-lg font-bold text-info">{fmt(listing.unitPrice)}</div>
                                <button onClick={() => buyItem(listing, listing.minOrderQty || 1)}
                                    disabled={attempts.some(a => a.listingId === listing.id && busy[a.key])}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-info text-info-foreground rounded-lg text-xs hover:bg-info/90 disabled:opacity-50">
                                    <ShoppingCart className="w-3 h-3" /> شراء ({listing.minOrderQty || 1}+)
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لا توجد عروض حالياً في السوق</p>
                </div>
            )}
        </div>
    );
}
