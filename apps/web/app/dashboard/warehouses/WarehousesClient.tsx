'use client';

import { useState, useEffect } from 'react';
import { Building2, Phone, MapPin, Truck, Package } from 'lucide-react';

export default function WarehousesPage() {
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        fetch('/api/warehouses').then(r => r.json()).then(d => setWarehouses(d.warehouses || [])).finally(() => setLoading(false));
    }, []);

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">🏭 المذاخر العراقية</h1>

            </div>



            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            ) : warehouses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {warehouses.map((wh: any) => (
                        <div key={wh.id} className="bg-card rounded-xl border shadow-sm p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                    <Building2 className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{wh.name}</h3>
                                    {wh.code && <span className="text-xs text-muted-foreground font-mono">{wh.code}</span>}
                                </div>
                                <span className={`mr-auto text-xs px-2 py-0.5 rounded-full ${wh.isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                    {wh.isActive ? 'فعال' : 'معطل'}
                                </span>
                            </div>
                            <div className="space-y-1.5 text-sm text-muted-foreground">
                                {wh.city && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {wh.city} {wh.address && `- ${wh.address}`}</div>}
                                {wh.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {wh.phone}</div>}
                                {wh.contactPerson && <div className="flex items-center gap-1">👤 {wh.contactPerson}</div>}
                                <div className="flex items-center gap-1 text-primary pt-1">
                                    <Package className="w-3 h-3" /> {wh._count?.orders || 0} طلب
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <Truck className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لم يتم إضافة مذاخر بعد</p>
                </div>
            )}
        </div>
    );
}
