'use client';

import { useState, useEffect } from 'react';
import { getPlans, updatePlan } from '@/app/lib/actions/plans';
import PlanForm from '@/app/ui/admin/plan-form';
import {
    PackageOpen, Plus, Shield, ShieldOff, Loader2, Edit, X
} from 'lucide-react';

export default function AdminPlansPage() {
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchPlans = async () => {
        setLoading(true);
        const res = await getPlans();
        if (res.success && res.data) {
            setPlans(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    const handleCreate = () => {
        setSelectedPlan(null);
        setShowModal(true);
    };

    const handleEdit = (plan: any) => {
        setSelectedPlan(plan);
        setShowModal(true);
    };

    const handleToggleStatus = async (plan: any) => {
        setActionLoading(plan.id);
        const res = await updatePlan(plan.id, {
            name: plan.name,
            price: Number(plan.price),
            maxBranches: Number(plan.maxBranches),
            maxUsers: Number(plan.maxUsers),
            features: plan.features,
            isActive: !plan.isActive,
        });
        if (res.success) {
            fetchPlans();
        }
        setActionLoading(null);
    };

    const closeModal = () => {
        setShowModal(false);
        fetchPlans();
    };

    return (
        <div className="glass-card space-y-6 p-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                        <PackageOpen className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">باقات الاشتراك</h1>
                        <p className="text-sm text-muted-foreground">إدارة باقات المنصة والحدود الخاصة بها</p>
                    </div>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary/20"
                >
                    <Plus className="w-4 h-4" />
                    باقة جديدة
                </button>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-foreground">
                                {selectedPlan ? "تعديل باقة" : "إنشاء باقة جديدة"}
                            </h2>
                            <button onClick={closeModal} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <PlanForm plan={selectedPlan} onClose={closeModal} />
                    </div>
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : plans.length > 0 ? (
                <div className="bg-card border border-border rounded-xl overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">اسم الباقة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">السعر الشهري</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">حد الفروع</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">حد المستخدمين</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الحالة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.map(plan => {
                                const isLoading = actionLoading === plan.id;
                                return (
                                    <tr key={plan.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                                        <td className="py-3 px-4 font-semibold text-foreground">{plan.name}</td>
                                        <td className="py-3 px-4 text-primary font-bold">
                                            {Number(plan.price).toLocaleString('en-US')} IQD
                                        </td>
                                        <td className="py-3 px-4">
                                            {plan.maxBranches === -1 ? 'غير محدود' : plan.maxBranches}
                                        </td>
                                        <td className="py-3 px-4">
                                            {plan.maxUsers === -1 ? 'غير محدود' : plan.maxUsers}
                                        </td>
                                        <td className="py-3 px-4">
                                            {plan.isActive ? (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                                                    <Shield className="w-3 h-3" /> ومتاحة
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                                    <ShieldOff className="w-3 h-3" /> مخفية
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                {isLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-2" />
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => handleToggleStatus(plan)}
                                                            className={`p-1.5 rounded-lg transition-colors text-xs ${plan.isActive
                                                                ? 'hover:bg-destructive/10 text-destructive/70 hover:text-destructive'
                                                                : 'hover:bg-success/10 text-success/70 hover:text-success'
                                                                }`}
                                                            title={plan.isActive ? 'إخفاء' : 'إتاحة'}
                                                        >
                                                            {plan.isActive ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(plan)}
                                                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary/70 hover:text-primary transition-colors"
                                                            title="تعديل"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                    </>
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
                    <PackageOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لا توجد باقات بعد.</p>
                </div>
            )}
        </div>
    );
}
