'use client';

// Pass 3, Part A من ميزة المذاخر: شاشة تأسيس المذخر لإدارة المنصة (SUPER_ADMIN).
// هذه الصفحة محمية مرتين: middleware.ts عبر SUPER_ADMIN_ROUTES (بادئة
// /dashboard/admin) و app/dashboard/admin/layout.tsx الذي يعيد التوجيه لأي
// دور غير SUPER_ADMIN — بنفس آلية بقية صفحات هذه المنطقة (لا حارس إضافي هنا).
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Warehouse as WarehouseIcon, Plus, Loader2, AlertTriangle, Check, Copy,
    Phone, MapPin, Package, Users, Eye, EyeOff, Pencil, KeyRound, Power, PowerOff, X, Link2,
} from 'lucide-react';
import SupplierLinksModal from './SupplierLinksModal';
import LinkRequestsPanel from './LinkRequestsPanel';

interface WarehouseUserRow {
    id: string;
    email: string;
    warehouseUserType: string | null;
    // Feature 3 من الميزات الثلاث الأخيرة: يحظر SUPER_ADMIN دخول حساب مذخر
    // كاملاً عبر هذا الحقل — لا علاقة له بـ Warehouse.isActive (Task 3 أعلاه،
    // الذي يخفي المذخر عن دليل الصيدليات فقط ولا يمنع أحداً من الدخول).
    isActive: boolean;
}

interface WarehouseRow {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    city: string | null;
    address: string | null;
    contactPerson: string | null;
    isActive: boolean;
    _count: { catalogItems: number; users: number };
    users: WarehouseUserRow[];
}

/** مالك المذخر لعرض بريد الدخول واستهداف إعادة تعيين كلمة المرور — يُفضَّل
 * صاحب warehouseUserType === 'OWNER'، وإلا أول حساب بلا warehouseUserType
 * (مذخر أُسّس عبر POST /api/warehouses القديم بلا هذا الحقل أصلاً)، وإلا لا
 * شيء. عمداً لا يسقط أبداً إلى أول حساب مهما كان نوعه: بعد Feature 1 (حسابات
 * STAFF) قد يكون أول حساب مرتبط بالمذخر موظفاً لا مالكاً — والسقوط إليه هنا
 * كان سيجعل «إعادة تعيين كلمة المرور» تستهدف حساب الموظف الخطأ بصمت. */
function getOwnerUser(wh: WarehouseRow): WarehouseUserRow | undefined {
    return (
        wh.users.find(u => u.warehouseUserType === 'OWNER') ??
        wh.users.find(u => !u.warehouseUserType)
    );
}

const inputClass = "w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-colors";

export default function AdminWarehousesPage() {
    const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
    // المرحلة 1: ربط مورد محلي موجود بهذا المذخر بدل إنشاء مورد مرآة بلا تاريخ.
    const [linkingWarehouse, setLinkingWarehouse] = useState<WarehouseRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [form, setForm] = useState({
        name: '', phone: '', city: '', address: '', contactPerson: '', email: '',
        ownerEmail: '', ownerPassword: '',
    });
    const [createdOwnerEmail, setCreatedOwnerEmail] = useState<string | null>(null);

    const fetchWarehouses = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/warehouses');
            if (res.ok) {
                const data = await res.json();
                setWarehouses(data.warehouses || []);
            }
        } catch (e) {
            console.error('Failed to fetch warehouses:', e);
        } finally {
            setLoading(false);
        }
    };

    // نسخة صامتة من fetchWarehouses بلا setLoading(true) — تُستخدم بعد
    // إجراءات الجدول (تعديل/تفعيل/تعطيل) كي لا يختفي الجدول بالكامل خلف
    // مؤشر تحميل عند كل حفظ صغير (fetchWarehouses تبقى فقط للتحميل الأولي
    // ونجاح إنشاء مذخر، حيث لوحة النجاح تُخفي الجدول أصلاً).
    const refreshWarehouses = async () => {
        try {
            const res = await fetch('/api/admin/warehouses');
            if (res.ok) {
                const data = await res.json();
                setWarehouses(data.warehouses || []);
            }
        } catch (e) {
            console.error('Failed to refresh warehouses:', e);
        }
    };

    useEffect(() => {
        fetchWarehouses();
    }, []);

    const resetModal = () => {
        setShowModal(false);
        setModalError([]);
        setCreatedOwnerEmail(null);
        setCopied(false);
        setShowPassword(false);
        setForm({
            name: '', phone: '', city: '', address: '', contactPerson: '', email: '',
            ownerEmail: '', ownerPassword: '',
        });
    };

    const handleCreate = async () => {
        setSaving(true);
        setModalError([]);
        try {
            const res = await fetch('/api/admin/warehouses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    warehouse: {
                        name: form.name,
                        phone: form.phone || undefined,
                        city: form.city || undefined,
                        address: form.address || undefined,
                        contactPerson: form.contactPerson || undefined,
                        email: form.email || undefined,
                    },
                    owner: {
                        email: form.ownerEmail,
                        password: form.ownerPassword,
                        // مالك المذخر هو نفسه الشخص المسؤول — لا حقل منفصل له.
                        name: form.contactPerson || undefined,
                    },
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setCreatedOwnerEmail(data.owner?.email ?? form.ownerEmail);
                fetchWarehouses();
            } else {
                setModalError(data.errors && Array.isArray(data.errors) ? data.errors : [data.error || 'حدث خطأ غير متوقع']);
            }
        } catch (e) {
            console.error('Failed to create warehouse:', e);
            setModalError(['تعذر الاتصال بالسيرفر']);
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = () => {
        if (!createdOwnerEmail) return;
        navigator.clipboard.writeText(createdOwnerEmail);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Task 3: تفعيل / تعطيل ────────────────────────────────────────────
    const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);

    const handleToggleActive = async (wh: WarehouseRow) => {
        if (wh.isActive) {
            const ok = confirm(
                `تعطيل "${wh.name}"؟\n\nسيختفي المذخر عن دليل الصيدليات فلا تصله طلبات جديدة، ` +
                'لكنه يبقى قادراً على إكمال طلباته الحالية (تسعير/شحن/تسليم)، ولن يُسجَّل خروج صاحبه ولا يُمنع من الدخول للبوابة.'
            );
            if (!ok) return;
        }
        setToggleLoadingId(wh.id);
        try {
            const res = await fetch(`/api/admin/warehouses/${wh.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !wh.isActive }),
            });
            if (res.ok) {
                await refreshWarehouses();
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'تعذّر تغيير حالة المذخر');
            }
        } catch (e) {
            console.error('Failed to toggle warehouse:', e);
            alert('تعذر الاتصال بالسيرفر');
        } finally {
            setToggleLoadingId(null);
        }
    };

    // ── Task 4: تعديل بيانات المذخر ──────────────────────────────────────
    const [editingWarehouse, setEditingWarehouse] = useState<WarehouseRow | null>(null);
    const [editForm, setEditForm] = useState({ name: '', phone: '', city: '', contactPerson: '', address: '' });
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string[]>([]);

    const openEditModal = (wh: WarehouseRow) => {
        setEditingWarehouse(wh);
        setEditError([]);
        setEditForm({
            name: wh.name ?? '',
            phone: wh.phone ?? '',
            city: wh.city ?? '',
            contactPerson: wh.contactPerson ?? '',
            address: wh.address ?? '',
        });
    };

    const closeEditModal = () => {
        setEditingWarehouse(null);
        setEditError([]);
        setSavingEdit(false);
    };

    const handleSaveEdit = async () => {
        if (!editingWarehouse) return;
        setSavingEdit(true);
        setEditError([]);
        try {
            const res = await fetch(`/api/admin/warehouses/${editingWarehouse.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editForm.name,
                    phone: editForm.phone,
                    city: editForm.city,
                    contactPerson: editForm.contactPerson,
                    address: editForm.address,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await refreshWarehouses();
                closeEditModal();
            } else {
                setEditError(data.errors && Array.isArray(data.errors) ? data.errors : [data.error || 'حدث خطأ غير متوقع']);
            }
        } catch (e) {
            console.error('Failed to update warehouse:', e);
            setEditError(['تعذر الاتصال بالسيرفر']);
        } finally {
            setSavingEdit(false);
        }
    };

    // ── Task 2: إعادة تعيين كلمة المرور ──────────────────────────────────
    const [resettingWarehouse, setResettingWarehouse] = useState<WarehouseRow | null>(null);
    const [resetPasswordValue, setResetPasswordValue] = useState('');
    const [resetShowPassword, setResetShowPassword] = useState(false);
    const [resetSaving, setResetSaving] = useState(false);
    const [resetError, setResetError] = useState<string[]>([]);
    const [resetDone, setResetDone] = useState(false);

    const openResetModal = (wh: WarehouseRow) => {
        setResettingWarehouse(wh);
        setResetPasswordValue('');
        setResetShowPassword(false);
        setResetError([]);
        setResetDone(false);
    };

    const closeResetModal = () => {
        setResettingWarehouse(null);
        setResetPasswordValue('');
        setResetShowPassword(false);
        setResetError([]);
        setResetSaving(false);
        setResetDone(false);
    };

    const handleResetPassword = async () => {
        if (!resettingWarehouse) return;
        const owner = getOwnerUser(resettingWarehouse);
        if (!owner) return;
        setResetSaving(true);
        setResetError([]);
        try {
            const res = await fetch(`/api/admin/warehouses/${resettingWarehouse.id}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: owner.id, password: resetPasswordValue }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setResetDone(true);
            } else {
                setResetError(data.errors && Array.isArray(data.errors) ? data.errors : [data.error || 'حدث خطأ غير متوقع']);
            }
        } catch (e) {
            console.error('Failed to reset warehouse password:', e);
            setResetError(['تعذر الاتصال بالسيرفر']);
        } finally {
            setResetSaving(false);
        }
    };

    // ── Feature 3: حظر/استعادة دخول حساب مذخر (User.isActive) ───────────────
    // ملاحظة مهمّة (ذُكرت أيضاً في نص المهمة): إعادة تعيين كلمة مرور حساب
    // isActive === false لا تعيد له الوصول إطلاقاً — auth.ts يرفض الدخول بمجرد
    // isActive === false قبل حتى مقارنة كلمة المرور، فلا فائدة من تبديل كلمة
    // المرور لحساب موقوف.
    const [managingWarehouse, setManagingWarehouse] = useState<WarehouseRow | null>(null);
    const [userToggleLoadingId, setUserToggleLoadingId] = useState<string | null>(null);
    const [userToggleError, setUserToggleError] = useState<string | null>(null);

    const openManageUsersModal = (wh: WarehouseRow) => {
        setManagingWarehouse(wh);
        setUserToggleError(null);
    };

    const closeManageUsersModal = () => {
        setManagingWarehouse(null);
        setUserToggleError(null);
        setUserToggleLoadingId(null);
    };

    const handleToggleUserActive = async (warehouseId: string, u: WarehouseUserRow) => {
        setUserToggleError(null);
        if (u.isActive) {
            const ok = confirm(
                `إيقاف حساب «${u.email}»؟\n\nلن يستطيع صاحبه تسجيل الدخول إطلاقاً بعد ذلك — إعادة تعيين كلمة المرور لن تعيد له الوصول أيضاً.`
            );
            if (!ok) return;
        }
        setUserToggleLoadingId(u.id);
        try {
            const res = await fetch(`/api/admin/warehouses/${warehouseId}/users/${u.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !u.isActive }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setUserToggleError(data.error || 'تعذّر تغيير حالة الحساب');
                return;
            }
            setManagingWarehouse((prev) =>
                prev && prev.id === warehouseId
                    ? { ...prev, users: prev.users.map((x) => (x.id === u.id ? { ...x, isActive: data.user.isActive } : x)) }
                    : prev
            );
            await refreshWarehouses();
        } catch (e) {
            console.error('Failed to toggle warehouse user:', e);
            setUserToggleError('تعذر الاتصال بالسيرفر');
        } finally {
            setUserToggleLoadingId(null);
        }
    };

    return (
        <div className="glass-card space-y-6 p-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <WarehouseIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">المذاخر</h1>
                        <p className="text-sm text-muted-foreground">تأسيس المذاخر وحسابات الدخول الخاصة بها</p>
                    </div>
                </div>
                <button
                    onClick={() => { resetModal(); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-bold transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    إضافة مذخر
                </button>
            </div>

            {/* طلبات الربط التي رفعتها المؤسسات من صفحة الموردين */}
            <LinkRequestsPanel />

            {/* ==================== Modal ==================== */}
            {showModal && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
                    <div className="bg-card border border-border rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        {createdOwnerEmail ? (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="mx-auto mb-3 w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
                                        <Check className="w-6 h-6 text-success" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">تم تأسيس المذخر بنجاح</h2>
                                </div>

                                <div className="bg-muted/30 border border-border rounded-md p-4 space-y-2">
                                    <div className="text-xs text-muted-foreground mb-1">البريد الإلكتروني لحساب المذخر</div>
                                    <div className="flex items-center gap-2">
                                        <code className="font-mono text-sm bg-background px-3 py-1.5 rounded-md text-foreground border border-border flex-1 text-center" dir="ltr">
                                            {createdOwnerEmail}
                                        </code>
                                        <button
                                            onClick={handleCopy}
                                            className="p-2 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                            title="نسخ"
                                        >
                                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <p className="text-xs text-muted-foreground text-center">
                                    سلّم بيانات الدخول (البريد وكلمة المرور) لصاحب المذخر ليتمكن من الدخول لبوابة المذخر
                                </p>

                                <button
                                    onClick={resetModal}
                                    className="w-full px-4 py-2.5 bg-muted text-foreground rounded-md text-sm hover:bg-muted/80 transition-colors font-bold"
                                >
                                    إغلاق
                                </button>
                            </div>
                        ) : (
                            <>
                                <h3 className="font-bold text-foreground mb-4">إضافة مذخر جديد</h3>

                                {modalError.length > 0 && (
                                    <div className="mb-4 p-3 rounded-md text-sm flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <ul className="space-y-1">
                                            {modalError.map((err, i) => <li key={i}>{err}</li>)}
                                        </ul>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <div className="text-xs font-bold text-muted-foreground mb-2">بيانات المذخر</div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">اسم المذخر *</label>
                                                <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">الهاتف</label>
                                                    <input className={inputClass} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} dir="ltr" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">المدينة</label>
                                                    <input className={inputClass} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">الشخص المسؤول</label>
                                                    <input className={inputClass} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">العنوان</label>
                                                    <input className={inputClass} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-border">
                                        <div className="text-xs font-bold text-muted-foreground mb-2 mt-2">حساب مالك المذخر (تسجيل الدخول)</div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">البريد الإلكتروني *</label>
                                                <input className={inputClass} value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })} dir="ltr" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">كلمة المرور * (6 أحرف على الأقل)</label>
                                                <div className="relative">
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        className={`${inputClass} pl-10`}
                                                        value={form.ownerPassword}
                                                        onChange={e => setForm({ ...form, ownerPassword: e.target.value })}
                                                        dir="ltr"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                                                        tabIndex={-1}
                                                    >
                                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={handleCreate}
                                        disabled={saving || !form.name || !form.ownerEmail || !form.ownerPassword}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50 transition-colors"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        {saving ? 'جاري الحفظ...' : 'إنشاء المذخر'}
                                    </button>
                                    <button
                                        onClick={resetModal}
                                        disabled={saving}
                                        className="px-4 py-2.5 bg-muted text-muted-foreground rounded-md text-sm hover:bg-muted/80 transition-colors"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== Edit Modal (Task 4) ==================== */}
            {editingWarehouse && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
                    <div className="bg-card border border-border rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-foreground mb-4">تعديل بيانات المذخر</h3>

                        {editError.length > 0 && (
                            <div className="mb-4 p-3 rounded-md text-sm flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <ul className="space-y-1">
                                    {editError.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">اسم المذخر *</label>
                                <input className={inputClass} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">الهاتف</label>
                                    <input className={inputClass} value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} dir="ltr" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">المدينة</label>
                                    <input className={inputClass} value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">الشخص المسؤول</label>
                                    <input className={inputClass} value={editForm.contactPerson} onChange={e => setEditForm({ ...editForm, contactPerson: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">العنوان</label>
                                    <input className={inputClass} value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleSaveEdit}
                                disabled={savingEdit || !editForm.name.trim()}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50 transition-colors"
                            >
                                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                            </button>
                            <button
                                onClick={closeEditModal}
                                disabled={savingEdit}
                                className="px-4 py-2.5 bg-muted text-muted-foreground rounded-md text-sm hover:bg-muted/80 transition-colors"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== Reset Password Modal (Task 2) ==================== */}
            {resettingWarehouse && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
                    <div className="bg-card border border-border rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                        {resetDone ? (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="mx-auto mb-3 w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
                                        <Check className="w-6 h-6 text-success" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">تم تغيير كلمة المرور</h2>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        سلّم بيانات الدخول الجديدة لصاحب المذخر «{resettingWarehouse.name}»
                                    </p>
                                </div>
                                <div className="bg-muted/30 border border-border rounded-md p-4 space-y-2">
                                    <div className="text-xs text-muted-foreground mb-1">البريد الإلكتروني</div>
                                    <code className="font-mono text-sm text-foreground block text-center" dir="ltr">
                                        {getOwnerUser(resettingWarehouse)?.email ?? '—'}
                                    </code>
                                </div>
                                <button
                                    onClick={closeResetModal}
                                    className="w-full px-4 py-2.5 bg-muted text-foreground rounded-md text-sm hover:bg-muted/80 transition-colors font-bold"
                                >
                                    إغلاق
                                </button>
                            </div>
                        ) : (
                            <>
                                <h3 className="font-bold text-foreground mb-1">إعادة تعيين كلمة المرور</h3>
                                <p className="text-xs text-muted-foreground mb-4" dir="ltr">
                                    {getOwnerUser(resettingWarehouse)?.email ?? '—'}
                                </p>

                                {resetError.length > 0 && (
                                    <div className="mb-4 p-3 rounded-md text-sm flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <ul className="space-y-1">
                                            {resetError.map((err, i) => <li key={i}>{err}</li>)}
                                        </ul>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">كلمة المرور الجديدة * (6 أحرف على الأقل)</label>
                                    <div className="relative">
                                        <input
                                            type={resetShowPassword ? 'text' : 'password'}
                                            className={`${inputClass} pl-10`}
                                            value={resetPasswordValue}
                                            onChange={e => setResetPasswordValue(e.target.value)}
                                            dir="ltr"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setResetShowPassword(!resetShowPassword)}
                                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                                            tabIndex={-1}
                                        >
                                            {resetShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={handleResetPassword}
                                        disabled={resetSaving || resetPasswordValue.length < 6}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50 transition-colors"
                                    >
                                        {resetSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                        {resetSaving ? 'جاري الحفظ...' : 'تعيين كلمة المرور'}
                                    </button>
                                    <button
                                        onClick={closeResetModal}
                                        disabled={resetSaving}
                                        className="px-4 py-2.5 bg-muted text-muted-foreground rounded-md text-sm hover:bg-muted/80 transition-colors"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== Manage Users Modal (Feature 3) ==================== */}
            {managingWarehouse && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
                    <div className="bg-card border border-border rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between mb-1">
                            <h3 className="font-bold text-foreground">حسابات «{managingWarehouse.name}»</h3>
                            <button
                                onClick={closeManageUsersModal}
                                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">
                            تعطيل المذخر يخفيه عن الصيدليات فقط؛ توقيف الحساب يمنع صاحبه من تسجيل الدخول نهائياً.
                        </p>

                        {userToggleError && (
                            <div className="mb-4 p-3 rounded-md text-sm flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{userToggleError}</span>
                            </div>
                        )}

                        {managingWarehouse.users.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">لا يوجد حسابات مرتبطة بهذا المذخر</p>
                        ) : (
                            <div className="space-y-2">
                                {managingWarehouse.users.map((u) => {
                                    const isTogglingUser = userToggleLoadingId === u.id;
                                    return (
                                        <div key={u.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-3">
                                            <div className="min-w-0">
                                                <code className="font-mono text-xs text-foreground block truncate" dir="ltr">{u.email}</code>
                                                <span className="text-xs text-muted-foreground">
                                                    {u.warehouseUserType === 'OWNER' ? 'مالك' : 'موظف'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {u.isActive ? (
                                                    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">فعال</span>
                                                ) : (
                                                    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">موقوف</span>
                                                )}
                                                {isTogglingUser ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground m-1.5" />
                                                ) : (
                                                    <button
                                                        onClick={() => handleToggleUserActive(managingWarehouse.id, u)}
                                                        className={`p-1.5 rounded-md transition-colors ${u.isActive
                                                            ? 'hover:bg-destructive/10 text-destructive/70 hover:text-destructive'
                                                            : 'hover:bg-success/10 text-success/70 hover:text-success'
                                                            }`}
                                                        title={u.isActive ? 'توقيف' : 'تفعيل'}
                                                    >
                                                        {u.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            onClick={closeManageUsersModal}
                            className="w-full mt-4 px-4 py-2.5 bg-muted text-foreground rounded-md text-sm hover:bg-muted/80 transition-colors font-bold"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== ربط الموردين ==================== */}
            {linkingWarehouse && (
                <SupplierLinksModal
                    warehouse={linkingWarehouse}
                    onClose={() => setLinkingWarehouse(null)}
                />
            )}

            {/* ==================== Table ==================== */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : warehouses.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <PowerOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        التعطيل يخفي المذخر عن الصيدليات فلا تصله طلبات جديدة، لكنه يبقى قادراً على إكمال طلباته الحالية. لا يسجّل خروج صاحب الحساب ولا يمنعه من الدخول للبوابة.
                    </p>
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        تعطيل المذخر يخفيه عن الصيدليات فقط؛ توقيف الحساب (من عمود «الحسابات المرتبطة») يمنع صاحبه من تسجيل الدخول نهائياً — إعادة تعيين كلمة المرور لا تعيد له الوصول.
                    </p>
                    <div className="bg-card border border-border rounded-lg overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">الاسم</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">البريد الإلكتروني</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">المدينة</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">الهاتف</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">الحالة</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">أصناف الكتالوج</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">الحسابات المرتبطة</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {warehouses.map((wh) => {
                                    const owner = getOwnerUser(wh);
                                    const isToggling = toggleLoadingId === wh.id;
                                    return (
                                        <tr key={wh.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="font-medium text-foreground">{wh.name}</div>
                                                {wh.code && <div className="text-xs text-muted-foreground font-mono">{wh.code}</div>}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                {owner ? (
                                                    <code className="font-mono text-xs" dir="ltr">{owner.email}</code>
                                                ) : '—'}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                {wh.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {wh.city}</span>}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                {wh.phone && <span className="inline-flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" /> {wh.phone}</span>}
                                            </td>
                                            <td className="py-3 px-4">
                                                {wh.isActive ? (
                                                    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">فعال</span>
                                                ) : (
                                                    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">معطل</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {wh._count.catalogItems}</span>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                <button
                                                    onClick={() => openManageUsersModal(wh)}
                                                    className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                                                    title="إدارة الحسابات"
                                                >
                                                    <Users className="w-3 h-3" /> {wh._count.users}
                                                </button>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => openEditModal(wh)}
                                                        className="p-1.5 rounded-md hover:bg-primary/10 text-primary/70 hover:text-primary transition-colors"
                                                        title="تعديل"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setLinkingWarehouse(wh)}
                                                        className="p-1.5 rounded-md hover:bg-primary/10 text-primary/70 hover:text-primary transition-colors"
                                                        title="ربط الموردين"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => owner && openResetModal(wh)}
                                                        disabled={!owner}
                                                        className="p-1.5 rounded-md hover:bg-primary/10 text-primary/70 hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                                        title={owner ? 'إعادة تعيين كلمة المرور' : 'لا يوجد حساب مرتبط بهذا المذخر'}
                                                    >
                                                        <KeyRound className="w-4 h-4" />
                                                    </button>
                                                    {isToggling ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground m-1.5" />
                                                    ) : (
                                                        <button
                                                            onClick={() => handleToggleActive(wh)}
                                                            className={`p-1.5 rounded-md transition-colors ${wh.isActive
                                                                ? 'hover:bg-destructive/10 text-destructive/70 hover:text-destructive'
                                                                : 'hover:bg-success/10 text-success/70 hover:text-success'
                                                                }`}
                                                            title={wh.isActive ? 'تعطيل' : 'تفعيل'}
                                                        >
                                                            {wh.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <WarehouseIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لا توجد مذاخر بعد. أضف أول مذخر لبدء العمل معه.</p>
                </div>
            )}
        </div>
    );
}
