"use client";

// Feature 1: عميل صفحة إدارة حسابات المذخر — سرد، إضافة، تغيير الدور،
// توقيف/تفعيل، وتخصيص صلاحيات فردية (Phase 3: الأدوار والصلاحيات).
// يستخدم بانر خطأ داخل الصفحة (وليس toast من react-hot-toast) لأن الـ
// Toaster المُركَّب في app/layout.tsx هو sonner فقط — رسائل react-hot-toast
// لا تظهر فعلياً في هذا التطبيق، ورسائل هذه الصفحة (رفض آخر مالك، تعارض
// البريد الإلكتروني...) يجب أن تكون مرئية دائماً.
import { useMemo, useState } from "react";
import {
    Plus, Loader2, AlertTriangle, Eye, EyeOff, Power, PowerOff, UserPlus,
    Settings2, RotateCcw, Save, X, ShieldAlert,
} from "lucide-react";
import {
    accessiblePages,
    getWarehouseDefaultPermissions,
    getWarehousePermissions,
    ineffectivePermissions,
    WAREHOUSE_PERMISSION_LABELS,
    WAREHOUSE_ROLE_LABELS,
    type WarehousePermissions,
} from "@/app/lib/warehouse-permissions";
import { ASSIGNABLE_WAREHOUSE_USER_TYPES } from "@/app/lib/warehouse-users";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import StatusChip from "@/app/warehouse/_components/StatusChip";
import Modal from "@/app/warehouse/_components/Modal";

interface UserRow {
    id: string;
    email: string;
    name: string | null;
    warehouseUserType: string | null;
    permissions: string | null;
    isActive: boolean;
}

const inputClass =
    "w-full rounded-lg border bg-muted px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-colors";

const selectClass =
    "rounded-lg border bg-muted px-2.5 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-colors";

/** كل مفاتيح الصلاحيات مجمّعة حسب الفئة، بترتيب ثابت — للوحة التحرير. */
const PERMISSION_GROUPS: { category: string; keys: (keyof WarehousePermissions)[] }[] = (() => {
    const order: string[] = [];
    const byCategory = new Map<string, (keyof WarehousePermissions)[]>();
    for (const key of Object.keys(WAREHOUSE_PERMISSION_LABELS) as (keyof WarehousePermissions)[]) {
        const { category } = WAREHOUSE_PERMISSION_LABELS[key];
        if (!byCategory.has(category)) {
            byCategory.set(category, []);
            order.push(category);
        }
        byCategory.get(category)!.push(key);
    }
    return order.map((category) => ({ category, keys: byCategory.get(category)! }));
})();

export default function UsersClient({
    initialUsers,
    currentUserId,
}: {
    initialUsers: UserRow[];
    currentUserId: string;
}) {
    const [users, setUsers] = useState<UserRow[]>(initialUsers);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ email: "", password: "", name: "", warehouseUserType: "SALES" });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [addErrors, setAddErrors] = useState<string[]>([]);
    const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
    const [toggleError, setToggleError] = useState<string | null>(null);
    const [roleChangeLoadingId, setRoleChangeLoadingId] = useState<string | null>(null);
    const [roleChangeError, setRoleChangeError] = useState<string | null>(null);
    const [editingPermsFor, setEditingPermsFor] = useState<string | null>(null);

    const resetForm = () => {
        setForm({ email: "", password: "", name: "", warehouseUserType: "SALES" });
        setShowPassword(false);
        setAddErrors([]);
    };

    const addStaff = async () => {
        setSaving(true);
        setAddErrors([]);
        try {
            const res = await fetch("/api/warehouse-portal/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: form.email,
                    password: form.password,
                    name: form.name || undefined,
                    warehouseUserType: form.warehouseUserType,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAddErrors(Array.isArray(data.errors) ? data.errors : [data.error ?? "حدث خطأ غير متوقع"]);
                return;
            }
            setUsers((prev) => [...prev, data.user]);
            resetForm();
            setShowForm(false);
        } catch (e) {
            console.error("Failed to add user:", e);
            setAddErrors(["تعذر الاتصال بالسيرفر"]);
        } finally {
            setSaving(false);
        }
    };

    const patchUser = async (userId: string, body: Record<string, unknown>) => {
        const res = await fetch("/api/warehouse-portal/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "تعذّر تنفيذ العملية");
        return data.user as UserRow;
    };

    const toggleActive = async (u: UserRow) => {
        setToggleError(null);
        if (u.isActive) {
            const ok = confirm(`إيقاف حساب «${u.email}»؟ لن يتمكن صاحبه من تسجيل الدخول بعد ذلك.`);
            if (!ok) return;
        }
        setToggleLoadingId(u.id);
        try {
            const updated = await patchUser(u.id, { isActive: !u.isActive });
            setUsers((prev) => prev.map((p) => (p.id === u.id ? updated : p)));
        } catch (e: any) {
            setToggleError(e?.message ?? "تعذّر الاتصال بالسيرفر");
        } finally {
            setToggleLoadingId(null);
        }
    };

    const changeRole = async (u: UserRow, newRole: string) => {
        if (newRole === u.warehouseUserType) return;
        setRoleChangeError(null);
        setRoleChangeLoadingId(u.id);
        try {
            const updated = await patchUser(u.id, { warehouseUserType: newRole });
            setUsers((prev) => prev.map((p) => (p.id === u.id ? updated : p)));
        } catch (e: any) {
            setRoleChangeError(e?.message ?? "تعذّر الاتصال بالسيرفر");
        } finally {
            setRoleChangeLoadingId(null);
        }
    };

    const savePermissions = async (userId: string, permissions: string | null) => {
        const updated = await patchUser(userId, { permissions });
        setUsers((prev) => prev.map((p) => (p.id === userId ? updated : p)));
    };

    const editingUser = users.find((u) => u.id === editingPermsFor) ?? null;

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="المستخدمون"
                description="حسابات الدخول التابعة لمذخرك — أضف موظفاً بدل مشاركة كلمة مرورك الخاصة."
                actions={
                    <button
                        onClick={() => {
                            resetForm();
                            setShowForm((v) => !v);
                        }}
                        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        <Plus className="h-4 w-4" />
                        إضافة مستخدم
                    </button>
                }
            />
            {/* الشرح المطلوب: الدور يضبط صلاحيات افتراضية، والتخصيص الفردي يتجاوزها. */}
            <p className="-mt-4 text-xs text-muted-foreground">
                كل دور يضبط مجموعة صلاحيات افتراضية — يمكنك بعد ذلك تخصيص كل صلاحية على حدة لكل
                مستخدم عبر «تعديل الصلاحيات»، فتتجاوز التخصيصات الفردية افتراضي الدور.
            </p>

            {toggleError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{toggleError}</span>
                </div>
            )}
            {roleChangeError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{roleChangeError}</span>
                </div>
            )}

            {showForm && (
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <h3 className="mb-4 font-bold text-foreground">حساب جديد</h3>

                    {addErrors.length > 0 && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <ul className="space-y-1">
                                {addErrors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                البريد الإلكتروني *
                            </label>
                            <input
                                className={inputClass}
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">الاسم</label>
                            <input
                                className={inputClass}
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">الدور</label>
                            <select
                                className={`${inputClass} appearance-none`}
                                value={form.warehouseUserType}
                                onChange={(e) => setForm({ ...form, warehouseUserType: e.target.value })}
                            >
                                {ASSIGNABLE_WAREHOUSE_USER_TYPES.map((role) => (
                                    <option key={role} value={role}>
                                        {WAREHOUSE_ROLE_LABELS[role]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                كلمة المرور * (6 أحرف على الأقل)
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className={`${inputClass} pl-10`}
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    dir="ltr"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                        <button
                            onClick={addStaff}
                            disabled={saving || !form.email || !form.password}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            {saving ? "جاري الحفظ..." : "إنشاء الحساب"}
                        </button>
                        <button
                            onClick={() => {
                                resetForm();
                                setShowForm(false);
                            }}
                            disabled={saving}
                            className="rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            )}

            {/* max-h + overflow-auto — انظر التعليق المطابق في AccountsClient.tsx. */}
            <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="sticky top-0 z-10 border-b bg-muted">
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">البريد الإلكتروني</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الاسم</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الدور</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الحالة</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => {
                            const isToggling = toggleLoadingId === u.id;
                            const isChangingRole = roleChangeLoadingId === u.id;
                            const isLegacyStaff = u.warehouseUserType === 'STAFF';
                            const hasCustomPerms = !!u.permissions;
                            return (
                                <tr key={u.id} className="border-b transition-colors hover:bg-muted/20">
                                    <td className="px-4 py-3">
                                        <code className="font-mono text-xs" dir="ltr">
                                            {u.email}
                                        </code>
                                        {u.id === currentUserId && (
                                            <span className="mr-2 text-xs text-muted-foreground">(أنت)</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{u.name ?? "—"}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {isChangingRole ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            ) : (
                                                <select
                                                    className={selectClass}
                                                    value={u.warehouseUserType ?? ''}
                                                    onChange={(e) => changeRole(u, e.target.value)}
                                                >
                                                    {isLegacyStaff && (
                                                        <option value="STAFF" disabled>
                                                            {WAREHOUSE_ROLE_LABELS.STAFF}
                                                        </option>
                                                    )}
                                                    {ASSIGNABLE_WAREHOUSE_USER_TYPES.map((role) => (
                                                        <option key={role} value={role}>
                                                            {WAREHOUSE_ROLE_LABELS[role]}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            {hasCustomPerms && <StatusChip variant="warning" label="مخصّص" className="px-1.5 py-0.5 text-[10px]" />}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusChip variant={u.isActive ? "success" : "danger"} label={u.isActive ? "فعال" : "موقوف"} bordered />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setEditingPermsFor(u.id)}
                                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                title="تعديل الصلاحيات"
                                            >
                                                <Settings2 className="inline h-4 w-4" /> <span className="text-xs">الصلاحيات</span>
                                            </button>
                                            {isToggling ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            ) : (
                                                <button
                                                    onClick={() => toggleActive(u)}
                                                    className={`rounded-md p-1.5 transition-colors ${
                                                        u.isActive
                                                            ? "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                                                            : "text-success/70 hover:bg-success/10 hover:text-success"
                                                    }`}
                                                    title={u.isActive ? "إيقاف" : "تفعيل"}
                                                >
                                                    {u.isActive ? <PowerOff className="inline h-4 w-4" /> : <Power className="inline h-4 w-4" />} <span className="text-xs">{u.isActive ? "إيقاف" : "تفعيل"}</span>
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

            {editingUser && (
                <PermissionsPanel
                    user={editingUser}
                    onClose={() => setEditingPermsFor(null)}
                    onSave={savePermissions}
                />
            )}
        </div>
    );
}

/** لوحة تحرير صلاحيات مستخدم واحد — تعرض افتراضي الدور مع تبديلات فردية فوقه. */
function PermissionsPanel({
    user,
    onClose,
    onSave,
}: {
    user: UserRow;
    onClose: () => void;
    onSave: (userId: string, permissions: string | null) => Promise<void>;
}) {
    const defaults = useMemo(() => getWarehouseDefaultPermissions(user.warehouseUserType), [user.warehouseUserType]);
    const initial = useMemo(
        () => getWarehousePermissions({ warehouseUserType: user.warehouseUserType, permissions: user.permissions }),
        [user.warehouseUserType, user.permissions]
    );
    const [perms, setPerms] = useState<WarehousePermissions>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isDirty = JSON.stringify(perms) !== JSON.stringify(initial);

    // الملخّص الحي أعلى اللوحة: "الصفحات التي سيصل إليها" — يُعاد حسابه من
    // حالة التبديلات نفسها (perms) في كل رندر، فيتحرّك فوراً مع كل تبديل قبل
    // الحفظ حتى، وهو صلب المطلوب في هذه المهمة (انظر accessiblePages).
    const pages = accessiblePages(perms);
    // صلاحيات فعّالة الاسم لكن بلا أثر فعلي لأن صلاحية عرض الصفحة التي تعمل
    // عليها مطفأة — نفس المصدر النقي (ineffectivePermissions)، مفهرَس هنا
    // بمفتاح الصلاحية لعرض تحذير على صفّها مباشرة بدل قائمة منفصلة.
    const ineffectiveByKey = useMemo(() => {
        const map = new Map<keyof WarehousePermissions, { requiresLabel: string }>();
        for (const item of ineffectivePermissions(perms)) {
            map.set(item.key, { requiresLabel: item.requiresLabel });
        }
        return map;
    }, [perms]);

    const togglePerm = (key: keyof WarehousePermissions) => {
        setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const resetToDefault = () => setPerms({ ...defaults });

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            // يُحفَظ الفرق عن افتراضي الدور فقط — نفس نمط
            // app/ui/users/permissions-editor.tsx على جانب الصيدلية.
            const overrides: Partial<WarehousePermissions> = {};
            for (const key of Object.keys(perms) as (keyof WarehousePermissions)[]) {
                if (perms[key] !== defaults[key]) overrides[key] = perms[key];
            }
            const permsString = Object.keys(overrides).length > 0 ? JSON.stringify(overrides) : null;
            await onSave(user.id, permsString);
            onClose();
        } catch (e: any) {
            setError(e?.message ?? "تعذّر الاتصال بالسيرفر");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title={`صلاحيات ${user.name || user.email}`} maxWidthClass="max-w-2xl">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card shadow-lg">
                <div className="sticky top-0 flex items-center justify-between gap-3 border-b bg-card px-5 py-4">
                    <div>
                        <h3 className="font-bold text-foreground">صلاحيات {user.name || user.email}</h3>
                        <p className="text-xs text-muted-foreground">
                            الدور الحالي: {WAREHOUSE_ROLE_LABELS[user.warehouseUserType ?? ''] ?? user.warehouseUserType ?? '—'}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-5">
                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* الملخّص الحي المطلوب: يجيب مباشرة عن سؤال المالك "أي صفحات
                        سيصل إليها هذا المستخدم فعلاً؟" — يتحرّك مع كل تبديل أدناه. */}
                    <div className="mb-4 rounded-lg border bg-muted/20 p-3">
                        <div className="mb-2 text-xs font-bold text-muted-foreground">الصفحات التي سيصل إليها:</div>
                        <div className="flex flex-wrap gap-1.5">
                            {pages.map((p) => (
                                <StatusChip key={p.href} variant="info" label={p.label} />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        {PERMISSION_GROUPS.map((group) => (
                            <div key={group.category} className="rounded-lg border">
                                <div className="border-b bg-muted/30 px-3 py-2 text-xs font-bold text-muted-foreground">
                                    {group.category}
                                </div>
                                <div className="divide-y">
                                    {group.keys.map((key) => {
                                        const on = perms[key];
                                        const isDefault = defaults[key];
                                        const meta = WAREHOUSE_PERMISSION_LABELS[key];
                                        const overridden = on !== isDefault;
                                        const ineffective = on ? ineffectiveByKey.get(key) : undefined;
                                        // اسم الصفحة المستهدفة لرسالة التحذير أدناه — مشتق من
                                        // نفس البيانات الوصفية (unlocksPage) الخاصة بصلاحية
                                        // العرض التي يحتاجها هذا الإجراء، لا نص ثابت منفصل قد
                                        // ينحرف عنها.
                                        const requiredPageNames = meta.requiresPermission
                                            ? WAREHOUSE_PERMISSION_LABELS[meta.requiresPermission].unlocksPage
                                            : undefined;
                                        return (
                                            <div key={key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-sm text-foreground">{meta.label}</span>
                                                        {overridden && (
                                                            <span className="text-[10px] font-bold text-warning">معدّل</span>
                                                        )}
                                                        {meta.sensitive && (
                                                            <span
                                                                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                                                                title="صلاحية ذات أثر تجاري أو إتلافي — امنحها بحذر"
                                                            >
                                                                <ShieldAlert className="h-2.5 w-2.5" /> حساس
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                                                    {meta.unlocksPage && (
                                                        <p className="mt-1 text-[11px] font-medium text-info">
                                                            يفتح صفحة: {meta.unlocksPage.join('، ')}
                                                        </p>
                                                    )}
                                                    {ineffective && (
                                                        <div className="mt-1.5 flex items-start gap-1 text-[11px] text-warning">
                                                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                            <span>
                                                                بلا أثر: يحتاج تفعيل &quot;{ineffective.requiresLabel}&quot; ليصل المستخدم
                                                                {requiredPageNames && requiredPageNames.length > 0
                                                                    ? ` لصفحة ${requiredPageNames.join('، ')}`
                                                                    : ''}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={on}
                                                    onClick={() => togglePerm(key)}
                                                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-success" : "bg-muted-foreground/25"}`}
                                                >
                                                    <span
                                                        className={`absolute right-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "-translate-x-5" : "translate-x-0"}`}
                                                    />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-card px-5 py-3">
                    <button
                        onClick={resetToDefault}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted"
                    >
                        <RotateCcw className="h-3.5 w-3.5" /> الافتراضي حسب الدور
                    </button>
                    <button
                        onClick={save}
                        disabled={saving || !isDirty}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saving ? "جاري الحفظ..." : "حفظ"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
