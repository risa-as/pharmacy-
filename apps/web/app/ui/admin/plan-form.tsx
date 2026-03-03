'use client';

import { useState } from 'react';
import { createPlan, updatePlan } from '@/app/lib/actions/plans';
import { Loader2, Plus, Edit2, Shield, ShieldOff, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function PlanForm({ plan, onClose }: { plan?: any, onClose: () => void }) {
    const isEdit = !!plan;
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: plan?.name || '',
        price: plan?.price || 0,
        maxBranches: plan?.maxBranches || 1,
        maxUsers: plan?.maxUsers || 3,
        isActive: plan?.isActive ?? true,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        const finalValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = isEdit
                ? await updatePlan(plan.id, formData)
                : await createPlan(formData);

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
            <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">اسم الباقة *</label>
                <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="مثال: الباقة الأساسية"
                    className={inputClass}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">السعر شهرياً (IQD) *</label>
                    <input
                        type="number"
                        name="price"
                        value={formData.price}
                        onChange={handleChange}
                        required
                        min="0"
                        className={inputClass}
                        dir="ltr"
                    />
                </div>
                <div>
                    {/* Placeholder for Layout purposes */}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">الحد الأقصى للفروع *</label>
                    <input
                        type="number"
                        name="maxBranches"
                        value={formData.maxBranches}
                        onChange={handleChange}
                        required
                        min="-1"
                        className={inputClass}
                        dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-left">-1 يعني غير محدود</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">الحد الأقصى للمستخدمين *</label>
                    <input
                        type="number"
                        name="maxUsers"
                        value={formData.maxUsers}
                        onChange={handleChange}
                        required
                        min="-1"
                        className={inputClass}
                        dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-left">-1 يعني غير محدود</p>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2 p-3 bg-muted/20 border border-border rounded-xl">
                <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                    تفعيل الباقة (تظهر للعملاء الجدد)
                </label>
            </div>

            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted/80 transition-all"
                    disabled={loading}
                >
                    إلغاء
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
                >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {!loading && <Save className="w-4 h-4" />}
                    {isEdit ? 'تحديث الباقة' : 'حفظ الباقة'}
                </button>
            </div>
        </form>
    );
}
