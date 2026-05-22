'use client';

import { useState } from 'react';
import { createPlan, updatePlan } from '@/app/lib/actions/plans';
import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const ALL_FLAGS = [
    { key: 'productMovement', label: 'حركة المنتجات', tier: 'Pro' },
    { key: 'granularPermissions', label: 'الصلاحيات التفصيلية', tier: 'Pro' },
    { key: 'branchManagement', label: 'إدارة الفروع', tier: 'Pro' },
    { key: 'advancedReports', label: 'التقارير المتقدمة', tier: 'Enterprise' },
    { key: 'branchComparison', label: 'مقارنة الفروع', tier: 'Enterprise' },
    { key: 'warehouseManagement', label: 'إدارة المستودعات', tier: 'Enterprise' },
    { key: 'interBranchTransfers', label: 'التحويلات بين الفروع', tier: 'Enterprise' },
    { key: 'marketplace', label: 'السوق الإلكتروني', tier: 'Enterprise' },
];

function defaultFeatures(plan?: any) {
    const f: Record<string, boolean> = {};
    ALL_FLAGS.forEach(({ key }) => {
        f[key] = plan?.features?.[key] ?? false;
    });
    return f;
}

export default function PlanForm({ plan, onClose }: { plan?: any, onClose: () => void }) {
    const isEdit = !!plan;
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: plan?.name || '',
        price: plan?.price || 0,
        maxBranches: plan?.maxBranches || 1,
        maxUsers: plan?.maxUsers || 3,
        maxDevices: plan?.maxDevices || 1,
        maxMobileUsers: plan?.maxMobileUsers || 1,
        isActive: plan?.isActive ?? true,
        isPopular: plan?.isPopular ?? false,
        features: defaultFeatures(plan),
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        const finalValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const toggleFlag = (key: string) => {
        setFormData(prev => ({
            ...prev,
            features: { ...prev.features, [key]: !prev.features[key] }
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...formData,
                price: Number(formData.price),
                maxBranches: Number(formData.maxBranches),
                maxUsers: Number(formData.maxUsers),
                maxDevices: Number(formData.maxDevices),
                maxMobileUsers: Number(formData.maxMobileUsers),
            };
            const res = isEdit
                ? await updatePlan(plan.id, payload)
                : await createPlan(payload);

            if (res.success) {
                toast.success(isEdit ? 'تم تحديث الباقة بنجاح' : 'تم إنشاء الباقة بنجاح');
                router.refresh();
                onClose();
            } else {
                toast.error(res.error || 'حدث خطأ أثناء حفظ الباقة');
            }
        } catch (error) {
            console.error(error);
            toast.error('حدث خطأ غير متوقع');
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all";

    return (
        <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            {/* Name */}
            <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">اسم الباقة *</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} required
                    placeholder="مثال: الباقة الاحترافية" className={inputClass} />
            </div>

            {/* Price */}
            <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">السعر الشهري <span dir="ltr">(IQD)</span> *</label>
                <input type="number" name="price" value={formData.price} onChange={handleChange} required min="0" className={inputClass} dir="ltr" />
            </div>

            {/* Limits */}
            <div className="grid grid-cols-2 gap-3">
                {[
                    { name: 'maxBranches', label: 'حد الفروع' },
                    { name: 'maxUsers', label: 'حد المستخدمين' },
                    { name: 'maxDevices', label: 'حد الأجهزة (كاشير)' },
                    { name: 'maxMobileUsers', label: 'حد جلسات الموبايل' },
                ].map(({ name, label }) => (
                    <div key={name}>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                        <input type="number" name={name} value={(formData as any)[name]} onChange={handleChange}
                            min="-1" className={inputClass} dir="ltr" />
                        <p className="text-xs text-muted-foreground mt-0.5">-1 = غير محدود</p>
                    </div>
                ))}
            </div>

            {/* Feature Flags */}
            <div className="border border-border rounded-xl p-4 space-y-3">
                <p className="text-sm font-bold text-foreground mb-2">🔒 ميزات الباقة (Feature Flags)</p>
                <div className="grid grid-cols-1 gap-2">
                    {ALL_FLAGS.map(({ key, label, tier }) => (
                        <label key={key} className="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-muted/50">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={formData.features[key]} onChange={() => toggleFlag(key)}
                                    className="w-4 h-4 text-primary rounded" />
                                <span className="text-sm text-foreground">{label}</span>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tier === 'Pro' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                                {tier}
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            {/* isActive + isPopular */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-muted/20 border border-border rounded-xl">
                    <input type="checkbox" id="isActive" name="isActive" checked={formData.isActive} onChange={handleChange}
                        className="w-4 h-4 text-primary rounded border-border focus:ring-primary" />
                    <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                        تفعيل الباقة (تظهر للعملاء الجدد)
                    </label>
                </div>
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <input type="checkbox" id="isPopular" name="isPopular" checked={formData.isPopular} onChange={handleChange}
                        className="w-4 h-4 text-amber-500 rounded border-amber-300 focus:ring-amber-400" />
                    <label htmlFor="isPopular" className="text-sm font-medium text-foreground cursor-pointer">
                        ⭐ الأكثر طلباً (تظهر شارة على بطاقة الأسعار)
                    </label>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                <button type="button" onClick={onClose} disabled={loading}
                    className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted/80 transition-all">
                    إلغاء
                </button>
                <button type="submit" disabled={loading}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-lg shadow-primary/20">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {!loading && <Save className="w-4 h-4" />}
                    {isEdit ? 'تحديث الباقة' : 'حفظ الباقة'}
                </button>
            </div>
        </form>
    );
}
