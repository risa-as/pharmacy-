'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ShoppingCart, Plus, Tag, Package } from 'lucide-react';

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

    const buyItem = async (listingId: string, qty: number) => {
        try {
            const res = await fetch('/api/marketplace/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listingId, quantity: qty })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage('✅ تم إرسال طلب الشراء بنجاح');
                fetchListings();
            } else {
                setMessage(`❌ ${data.error}`);
            }
        } catch (e) { setMessage('❌ خطأ في الاتصال'); }
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
                <div className="p-3 rounded-lg bg-muted text-sm text-center">{message}</div>
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
                                <button onClick={() => buyItem(listing.id, listing.minOrderQty || 1)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-info text-info-foreground rounded-lg text-xs hover:bg-info/90">
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
