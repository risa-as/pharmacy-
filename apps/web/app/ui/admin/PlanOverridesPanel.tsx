'use client';

import { useState } from 'react';
import { Shield, Save, RefreshCw, ChevronDown } from 'lucide-react';

interface Plan {
    id: string;
    name: string;
}

interface OrgOverrides {
    id: string;
    name: string;
    planId: string | null;
    maxBranches: number | null;
    maxUsers: number | null;
    maxDevices: number | null;
    maxMobileUsers: number | null;
    plan: { id: string; name: string; maxBranches: number; maxUsers: number; maxDevices: number; maxMobileUsers: number } | null;
}

interface Props {
    organizationId: string;
    organizationName: string;
    plans: Plan[];
}

export default function PlanOverridesPanel({ organizationId, organizationName, plans }: Props) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<OrgOverrides | null>(null);
    const [form, setForm] = useState({ planId: '', maxBranches: '', maxUsers: '', maxDevices: '', maxMobileUsers: '' });
    const [message, setMessage] = useState('');

    const fetchData = async () => {
        setLoading(true);
        setMessage('');
        try {
            const res = await fetch(`/api/admin/organizations/${organizationId}/plan-overrides`);
            const json = await res.json();
            if (json.success) {
                const org = json.organization as OrgOverrides;
                setData(org);
                setForm({
                    planId: org.planId || '',
                    maxBranches: org.maxBranches !== null ? String(org.maxBranches) : '',
                    maxUsers: org.maxUsers !== null ? String(org.maxUsers) : '',
                    maxDevices: org.maxDevices !== null ? String(org.maxDevices) : '',
                    maxMobileUsers: org.maxMobileUsers !== null ? String(org.maxMobileUsers) : '',
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next && !data) fetchData();
    };

    const save = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await fetch(`/api/admin/organizations/${organizationId}/plan-overrides`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: form.planId || null,
                    maxBranches: form.maxBranches,
                    maxUsers: form.maxUsers,
                    maxDevices: form.maxDevices,
                    maxMobileUsers: form.maxMobileUsers,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setMessage('✅ تم حفظ التغييرات بنجاح');
                setData(json.organization);
            } else {
                setMessage(`❌ ${json.error}`);
            }
        } finally {
            setSaving(false);
        }
    };

    const planDefault = (field: string) =>
        data?.plan ? String((data.plan as Record<string, unknown>)[field] ?? '—') : '—';

    return (
        <div className="border rounded-xl overflow-hidden mt-2">
            <button
                onClick={toggle}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>إعدادات الباقة والحدود</span>
                    {data?.plan && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {data.plan.name}
                        </span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="p-4 space-y-4 bg-card" dir="rtl">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            {/* Plan selector */}
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1">الباقة</label>
                                <select
                                    value={form.planId}
                                    onChange={e => setForm({ ...form, planId: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted"
                                >
                                    <option value="">بدون باقة محددة</option>
                                    {plans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Limit overrides */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { label: 'حد الفروع', field: 'maxBranches' as const, planField: 'maxBranches' as const },
                                    { label: 'حد المستخدمين', field: 'maxUsers' as const, planField: 'maxUsers' as const },
                                    { label: 'حد الأجهزة', field: 'maxDevices' as const, planField: 'maxDevices' as const },
                                    { label: 'حد موبايل', field: 'maxMobileUsers' as const, planField: 'maxMobileUsers' as const },
                                ].map(({ label, field, planField }) => (
                                    <div key={field}>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1">
                                            {label}
                                            <span className="font-normal opacity-60 mr-1">(الافتراضي: {planDefault(planField)})</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={form[field]}
                                            onChange={e => setForm({ ...form, [field]: e.target.value })}
                                            placeholder="إفتراضي الباقة"
                                            min={-1}
                                            className="w-full border rounded-lg px-3 py-2 text-sm bg-muted"
                                        />
                                        <p className="text-xs text-muted-foreground mt-0.5">-1 = غير محدود</p>
                                    </div>
                                ))}
                            </div>

                            {message && (
                                <p className="text-sm text-center py-1">{message}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    onClick={fetchData}
                                    className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-muted"
                                >
                                    <RefreshCw className="w-3 h-3" /> إعادة التحميل
                                </button>
                                <button
                                    onClick={save}
                                    disabled={saving}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"
                                >
                                    <Save className="w-3 h-3" /> {saving ? 'جاري الحفظ...' : 'حفظ'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
