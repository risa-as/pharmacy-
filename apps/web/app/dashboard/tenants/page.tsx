'use client';

import { useState, useEffect } from 'react';
import { Plus, Building2, Users, CreditCard, Crown } from 'lucide-react';

const planLabels: Record<string, { label: string; color: string; icon: string }> = {
    FREE: { label: 'مجاني', color: 'bg-muted text-foreground', icon: '🆓' },
    BASIC: { label: 'أساسي', color: 'bg-primary/10 text-primary', icon: '🔹' },
    PROFESSIONAL: { label: 'احترافي', color: 'bg-info text-info', icon: '💎' },
    ENTERPRISE: { label: 'مؤسسي', color: 'bg-warning/10 text-warning', icon: '🏢' },
};

export default function TenantsPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', ownerEmail: '', phone: '', plan: 'FREE' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/tenants').then(r => r.json()).then(d => setTenants(d.tenants || [])).finally(() => setLoading(false));
    }, []);

    const handleCreate = async () => {
        if (!form.name || !form.ownerEmail) return;
        setSaving(true);
        try {
            const res = await fetch('/api/tenants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            if (res.ok) {
                const data = await res.json();
                setTenants([data.tenant, ...tenants]);
                setShowForm(false);
                setForm({ name: '', ownerEmail: '', phone: '', plan: 'FREE' });
            }
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-IQ');

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">🏢 إدارة المؤسسات (SaaS)</h1>
                <button onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90">
                    <Plus className="w-4 h-4" /> إضافة مؤسسة
                </button>
            </div>

            {showForm && (
                <div className="bg-card rounded-xl shadow-sm border p-5 space-y-3">
                    <h2 className="font-bold text-foreground">مؤسسة جديدة</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input placeholder="اسم المؤسسة *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        <input placeholder="إيميل المالك *" value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                        <input placeholder="الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted">
                            <option value="FREE">مجاني</option>
                            <option value="BASIC">أساسي - $25/شهر</option>
                            <option value="PROFESSIONAL">احترافي - $75/شهر</option>
                            <option value="ENTERPRISE">مؤسسي - $200/شهر</option>
                        </select>
                    </div>
                    <button onClick={handleCreate} disabled={saving || !form.name || !form.ownerEmail}
                        className="px-4 py-2 bg-success text-success-foreground rounded-lg text-sm hover:bg-success/90 disabled:opacity-50">
                        {saving ? 'جاري الإنشاء...' : 'إنشاء'}
                    </button>
                </div>
            )}

            {/* Plans Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {Object.entries(planLabels).map(([key, plan]) => {
                    const count = tenants.filter(t => t.plan === key).length;
                    return (
                        <div key={key} className={`rounded-xl border p-4 ${plan.color}`}>
                            <div className="text-lg mb-1">{plan.icon}</div>
                            <div className="font-bold">{plan.label}</div>
                            <div className="text-2xl font-bold">{count}</div>
                        </div>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            ) : tenants.length > 0 ? (
                <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-muted border-b">
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">المؤسسة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الخطة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">المالك</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الفروع</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">المستخدمين</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">السعر</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الحالة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">انتهاء التجربة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map(t => {
                                const plan = planLabels[t.plan] || planLabels.FREE;
                                return (
                                    <tr key={t.id} className="border-b hover:bg-muted/50">
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-foreground">{t.name}</div>
                                            <div className="text-xs text-muted-foreground">{t.slug}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${plan.color}`}>
                                                {plan.icon} {plan.label}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-muted-foreground text-xs">{t.ownerEmail}</td>
                                        <td className="py-3 px-4 text-foreground">max {t.maxBranches}</td>
                                        <td className="py-3 px-4 text-foreground">max {t.maxUsers}</td>
                                        <td className="py-3 px-4 font-bold text-success">${t.monthlyPrice}/mo</td>
                                        <td className="py-3 px-4">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${t.isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                                {t.isActive ? 'فعال' : 'معطل'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-xs text-muted-foreground">
                                            {t.trialEndsAt ? formatDate(t.trialEndsAt) : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <Crown className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لا توجد مؤسسات بعد</p>
                </div>
            )}
        </div>
    );
}
