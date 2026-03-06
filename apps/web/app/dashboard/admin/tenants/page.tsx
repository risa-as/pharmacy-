'use client';

import { useState, useEffect } from 'react';
import { Plus, Building2, Users, CreditCard, Crown, Loader2, ShieldOff, ShieldAlert, ShieldCheck, Check, Copy, Eye, EyeOff, Edit2, Trash2 } from 'lucide-react';
import { suspendOrganization, reactivateOrganization } from '@/app/lib/actions/organization-suspension';

export default function TenantsPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '', phone: '', plan: '', maxBranches: 1, maxUsers: 3 });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [provisionResult, setProvisionResult] = useState<{
        licenseKey: string;
        organizationName: string;
        ownerEmail: string;
    } | null>(null);

    useEffect(() => {
        Promise.all([
            fetch('/api/admin/tenants').then(r => r.json()),
            fetch('/api/admin/plans').then(r => r.json())
        ]).then(([tenantsData, plansData]) => {
            setTenants(tenantsData.tenants || []);
            const validPlans = plansData.success ? plansData.data : (Array.isArray(plansData) ? plansData : []);
            setPlans(validPlans);

            // Set default plan
            if (validPlans.length > 0) {
                const defaultPlan = validPlans.find((p: any) => p.name === 'FREE' && p.isActive) || validPlans[0];
                setForm(prev => ({
                    ...prev,
                    plan: defaultPlan.id,
                    maxBranches: defaultPlan.maxBranches,
                    maxUsers: defaultPlan.maxUsers
                }));
            }
        }).finally(() => setLoading(false));
    }, []);

    const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const planId = e.target.value;
        const selectedPlan = plans.find(p => p.id === planId);

        setForm(prev => ({
            ...prev,
            plan: planId,
            maxBranches: selectedPlan ? selectedPlan.maxBranches : prev.maxBranches,
            maxUsers: selectedPlan ? selectedPlan.maxUsers : prev.maxUsers
        }));
    };

    const handleCreateOrUpdate = async () => {
        if (!form.name) return; // Name is required for both create and update

        if (!editingId && (!form.ownerEmail || !form.ownerPassword)) {
            // For creation, email and password are required
            return;
        }

        setSaving(true);
        try {
            const url = editingId ? `/api/admin/tenants/${editingId}` : '/api/admin/tenants';
            const method = editingId ? 'PATCH' : 'POST';

            // Only send ownerEmail and ownerPassword if creating
            const payload = editingId ? {
                name: form.name,
                plan: form.plan,
                maxBranches: form.maxBranches,
                maxUsers: form.maxUsers
            } : form;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                if (editingId) {
                    // Re-fetch tenants after update
                    const tenantsData = await fetch('/api/admin/tenants').then(r => r.json());
                    setTenants(tenantsData.tenants || []);
                } else {
                    setTenants([data.tenant, ...tenants]);
                    setProvisionResult({
                        licenseKey: data.tenant.licenseKey,
                        organizationName: data.tenant.name,
                        ownerEmail: data.tenant.ownerEmail,
                    });
                }
                setShowForm(false);
                setEditingId(null);
                setForm({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '', phone: '', plan: '', maxBranches: 1, maxUsers: 3 });
            } else {
                const data = await res.json();
                alert(data.error || 'حدث خطأ');
            }
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const handleToggleStatus = async (tenant: any) => {
        setActionLoading(tenant.id);
        let res;

        if (tenant.isActive) {
            if (!confirm(`هل أنت متأكد من تعطيل مؤسسة ${tenant.name}؟ سيتم إيقاف جميع الأجهزة المرتبطة.`)) {
                setActionLoading(null);
                return;
            }
            res = await suspendOrganization(tenant.id);
        } else {
            res = await reactivateOrganization(tenant.id);
        }

        if (res.success) {
            // Re-fetch tenants
            const tenantsData = await fetch('/api/admin/tenants').then(r => r.json());
            setTenants(tenantsData.tenants || []);
        } else {
            alert(res.error || 'حدث خطأ أثناء تغيير الحالة');
        }
        setActionLoading(null);
    };

    const handleEditClick = (tenant: any) => {
        setEditingId(tenant.id);
        const plan = plans.find(p => p.id === tenant.planId) || plans[0];
        setForm({
            name: tenant.name,
            ownerName: '', // Not editable
            ownerEmail: tenant.ownerEmail, // Informational, cannot be edited here
            ownerPassword: '', // Not editable
            phone: '',
            plan: plan?.id || '',
            maxBranches: tenant.maxBranches,
            maxUsers: tenant.maxUsers,
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteTenant = async (tenant: any) => {
        if (!confirm(`هل أنت متأكد من حذف مؤسسة ${tenant.name} نهائياً؟ سيتم حذف جميع الفروع والتراخيص والمستخدمين المرتبطين بها!`)) return;

        setActionLoading(`delete-${tenant.id}`);
        try {
            const res = await fetch(`/api/admin/tenants/${tenant.id}`, { method: 'DELETE' });
            if (res.ok) {
                setTenants(tenants.filter(t => t.id !== tenant.id));
            } else {
                const data = await res.json();
                alert(data.error || 'حدث خطأ أثناء الحذف');
            }
        } catch (e) {
            console.error(e);
            alert('تعذر الاتصال بالسيرفر');
        } finally {
            setActionLoading(null);
        }
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-IQ');

    const handleCopy = (key: string) => {
        navigator.clipboard.writeText(key);
        alert('تم نسخ المفتاح');
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-foreground">🏢 إدارة المؤسسات (SaaS)</h1>
                <button onClick={() => {
                    setEditingId(null);
                    setForm({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '', phone: '', plan: '', maxBranches: 1, maxUsers: 3 });
                    setShowForm(!showForm);
                }}
                    className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> إضافة مؤسسة
                </button>
            </div>

            {showForm && (
                <div className="bg-card rounded-xl shadow-sm border p-5 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="font-bold text-foreground">{editingId ? `تعديل مؤسسة: ${form.name}` : 'مؤسسة جديدة'}</h2>
                        <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input placeholder="اسم المؤسسة *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        <input placeholder="اسم المالك" value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" disabled={!!editingId} />
                        <input placeholder="إيميل المالك *" value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted opacity-60" dir="ltr" disabled={!!editingId} />
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} placeholder="كلمة المرور الافتراضية *" value={form.ownerPassword} onChange={e => setForm({ ...form, ownerPassword: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-muted pl-10" dir="ltr" disabled={!!editingId} title={editingId ? "لا يمكن تعديل كلمة المرور من هنا" : ""} />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                disabled={!!editingId}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <input placeholder="الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        <select value={form.plan} onChange={handlePlanChange}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted col-span-1 md:col-span-1">
                            {plans.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name} - {p.price === 0 ? 'مجاني' : `$${p.price}/شهر`}
                                </option>
                            ))}
                        </select>
                        <div className="grid grid-cols-2 gap-3 col-span-1 md:col-span-2">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">حد الفروع (تجاوز)</label>
                                <input type="number" value={form.maxBranches} onChange={e => setForm({ ...form, maxBranches: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">حد المستخدمين (تجاوز)</label>
                                <input type="number" value={form.maxUsers} onChange={e => setForm({ ...form, maxUsers: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                        </div>
                    </div>
                    <button onClick={handleCreateOrUpdate} disabled={saving || !form.name || (!editingId && (!form.ownerEmail || !form.ownerPassword))}
                        className="px-4 py-2 bg-success text-success-foreground rounded-lg text-sm hover:bg-success/90 disabled:opacity-50 mt-2">
                        {saving ? (editingId ? 'جاري التحديث...' : 'جاري الإنشاء...') : (editingId ? 'تحديث المؤسسة' : 'إنشاء')}
                    </button>
                </div>
            )}

            {provisionResult && (
                <div className="bg-success/10 border border-success/20 rounded-xl p-5 space-y-3 relative">
                    <button onClick={() => setProvisionResult(null)} className="absolute top-3 left-3 text-muted-foreground hover:text-foreground">✕</button>
                    <div className="flex items-center gap-2 text-success">
                        <Check className="w-5 h-5" />
                        <h2 className="font-bold">تم التأسيس بنجاح!</h2>
                    </div>
                    <div className="text-sm font-medium">مؤسسة: {provisionResult.organizationName}</div>
                    <div className="text-sm">إيميل المالك: <span dir="ltr">{provisionResult.ownerEmail}</span></div>
                    <div className="mt-2">
                        <div className="text-xs text-muted-foreground mb-1">مفتاح الترخيص الخاص بالفرع الرئيسي</div>
                        <div className="flex items-center gap-2 max-w-md">
                            <code className="flex-1 font-mono text-base bg-background px-3 py-2 rounded-lg text-foreground tracking-widest border border-border text-center">
                                {provisionResult.licenseKey}
                            </code>
                            <button
                                onClick={() => handleCopy(provisionResult.licenseKey)}
                                className="p-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                title="نسخ"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Plans Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {plans.map(plan => {
                    const count = tenants.filter(t => t.planId === plan.id).length;
                    return (
                        <div key={plan.id} className={`rounded-xl border p-4 bg-muted/30`}>
                            <div className="text-lg mb-1">{plan.price === 0 ? '🆓' : plan.price > 100 ? '🏢' : '🔹'}</div>
                            <div className="font-bold">{plan.name}</div>
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
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map(t => {
                                const plan = t.plan || plans.find(p => p.id === t.planId) || { name: 'غير محدد', price: 0 };
                                return (
                                    <tr key={t.id} className="border-b hover:bg-muted/50">
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-foreground">{t.name}</div>
                                            <div className="text-xs text-muted-foreground">{t.slug}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary`}>
                                                {plan.name}
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
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1">
                                                {actionLoading === t.id ? (
                                                    <Loader2 className="w-5 h-5 animate-spin mx-2 text-muted-foreground" />
                                                ) : actionLoading === `delete-${t.id}` ? (
                                                    <Loader2 className="w-5 h-5 animate-spin mx-2 text-destructive" />
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleToggleStatus(t)}
                                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${t.isActive
                                                                ? 'bg-warning/10 text-warning hover:bg-warning hover:text-white border border-warning/20'
                                                                : 'bg-success/10 text-success hover:bg-success hover:text-white border border-success/20'
                                                                }`}
                                                            title={t.isActive ? 'تعطيل' : 'تفعيل'}
                                                        >
                                                            {t.isActive ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                                        </button>

                                                        <button
                                                            onClick={() => handleEditClick(t)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20"
                                                            title="تعديل"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            onClick={() => handleDeleteTenant(t)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border border-destructive/20"
                                                            title="حذف"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>

                                                )}
                                            </div>
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
