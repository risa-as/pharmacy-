'use client';

import { useMemo, useState } from 'react';
import {
    Save, Shield, ChevronDown, ChevronUp, Search, RotateCcw, Check, AlertCircle, UserCog,
    ShoppingCart, Receipt, BookOpen, Package, Users as UsersIcon, Truck, Wallet,
    BarChart3, DoorOpen, MousePointerClick,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
    getUserPermissions,
    getDefaultPermissions,
    type UserPermissions
} from '@/app/lib/permissions';

interface User {
    id: string;
    name: string | null;
    email: string;
    role: string;
    permissions: string | null;
    branch: { name: string } | null;
}

const roleLabels: Record<string, string> = {
    ADMIN: 'مدير',
    PHARMACIST: 'صيدلي',
    CASHIER: 'كاشير',
};

const roleColors: Record<string, string> = {
    ADMIN: 'bg-destructive/10 text-destructive border-destructive/20',
    PHARMACIST: 'bg-primary/10 text-primary border-primary/20',
    CASHIER: 'bg-success/10 text-success border-success/20',
};

/**
 * Every permission is classified as either PAGE ACCESS (يتحكم بظهور صفحة
 * وإمكانية فتحها) or an ACTION (زر/ميزة محددة داخل صفحة), grouped by app
 * area, with a description naming exactly what it affects. Actions also
 * declare the page permission they depend on so the editor can dim them
 * (visual hint only) while the parent page is off.
 */
interface PermMeta {
    key: keyof UserPermissions;
    kind: 'page' | 'action';
    label: string;
    /** What exactly this toggle shows/hides — pages for `page`, buttons for `action`. */
    desc: string;
    /** Action is moot unless this page-access permission is on. */
    requires?: keyof UserPermissions;
}

const GROUPS: { id: string; label: string; icon: LucideIcon; perms: PermMeta[] }[] = [
    {
        id: 'pos',
        label: 'نقطة البيع',
        icon: ShoppingCart,
        perms: [
            { key: 'canSell', kind: 'page', label: 'الدخول لنقطة البيع', desc: 'فتح شاشة نقطة البيع وإتمام عمليات البيع' },
            { key: 'canApplyDiscount', kind: 'action', requires: 'canSell', label: 'تطبيق خصم', desc: 'تطبيق خصم يدوي على الفاتورة أثناء البيع' },
        ],
    },
    {
        id: 'sales',
        label: 'سجلات المبيعات',
        icon: Receipt,
        perms: [
            { key: 'canViewSales', kind: 'page', label: 'سجل المبيعات', desc: 'صفحات سجل المبيعات والدفعات' },
            { key: 'canDeleteSale', kind: 'action', requires: 'canViewSales', label: 'حذف فاتورة', desc: 'حذف فاتورة مبيعات من السجل' },
            { key: 'canViewReturns', kind: 'page', label: 'سجل المرتجعات', desc: 'صفحة المرتجعات وسجلها' },
            { key: 'canProcessReturn', kind: 'action', requires: 'canViewReturns', label: 'معالجة مرتجع', desc: 'تنفيذ إرجاع بضاعة واسترداد المبلغ للعميل' },
        ],
    },
    {
        id: 'debts',
        label: 'دفتر الديون',
        icon: BookOpen,
        perms: [
            { key: 'canViewDebts', kind: 'page', label: 'دفتر الديون', desc: 'صفحة الديون وكشوف حسابات العملاء' },
            { key: 'canPayDebt', kind: 'action', requires: 'canViewDebts', label: 'تسجيل سداد', desc: 'تسجيل دفعة سداد دين من عميل' },
        ],
    },
    {
        id: 'inventory',
        label: 'المخزون',
        icon: Package,
        perms: [
            { key: 'canViewInventory', kind: 'page', label: 'صفحات المخزون', desc: 'المخزون وقاعدة الأدوية والدفعات وحركة المنتجات' },
            { key: 'canAddDrug', kind: 'action', requires: 'canViewInventory', label: 'إضافة دواء', desc: 'إضافة دواء جديد إلى المخزون' },
            { key: 'canEditDrug', kind: 'action', requires: 'canViewInventory', label: 'تعديل دواء', desc: 'تعديل بيانات دواء موجود' },
            { key: 'canDeleteDrug', kind: 'action', requires: 'canViewInventory', label: 'حذف دواء', desc: 'حذف دواء من المخزون نهائياً' },
            { key: 'canEditPrice', kind: 'action', requires: 'canViewInventory', label: 'تعديل السعر', desc: 'تعديل سعر بيع صنف' },
            { key: 'canBulkEditPrice', kind: 'action', requires: 'canViewInventory', label: 'تعديل أسعار بالجملة', desc: 'تعديل أسعار عدة أصناف دفعة واحدة' },
            { key: 'canTransferStock', kind: 'action', requires: 'canViewInventory', label: 'تحويل بين الأفرع', desc: 'نقل مخزون من فرع إلى آخر' },
            { key: 'canDoStocktake', kind: 'page', label: 'الجرد', desc: 'صفحة الجرد وجلسات تسوية المخزون' },
        ],
    },
    {
        id: 'people',
        label: 'العملاء',
        icon: UsersIcon,
        perms: [
            { key: 'canViewPatients', kind: 'page', label: 'صفحات العملاء', desc: 'المرضى ونقاط الولاء والوصفات' },
            { key: 'canEditPatient', kind: 'action', requires: 'canViewPatients', label: 'تعديل بيانات مريض', desc: 'تعديل الملف الشخصي والحساسيات والأمراض المزمنة' },
        ],
    },
    {
        id: 'supply',
        label: 'التوريد',
        icon: Truck,
        perms: [
            { key: 'canViewSuppliers', kind: 'page', label: 'صفحات التوريد', desc: 'الموردون والمشتريات' },
            { key: 'canCreatePurchase', kind: 'action', requires: 'canViewSuppliers', label: 'إنشاء طلب شراء', desc: 'إنشاء أمر شراء جديد من مورد' },
        ],
    },
    {
        id: 'finance',
        label: 'المالية',
        icon: Wallet,
        perms: [
            { key: 'canViewExpenses', kind: 'page', label: 'المصاريف', desc: 'صفحة المصاريف وسجلها' },
            { key: 'canCreateExpense', kind: 'action', requires: 'canViewExpenses', label: 'تسجيل مصروف', desc: 'تسجيل مصروف جديد' },
        ],
    },
    {
        id: 'reports',
        label: 'التقارير',
        icon: BarChart3,
        perms: [
            { key: 'canViewReports', kind: 'page', label: 'مركز التقارير', desc: 'صفحة التقارير والتقارير التفصيلية' },
            { key: 'canViewProfitReport', kind: 'page', requires: 'canViewReports', label: 'تقارير الأرباح', desc: 'تقريرا الأرباح والخسائر وهامش الربح' },
            { key: 'canViewEmployeeReport', kind: 'page', requires: 'canViewReports', label: 'تقرير الموظفين', desc: 'تقرير أداء الموظفين ومساهمات المبيعات' },
            { key: 'canExportExcel', kind: 'action', requires: 'canViewReports', label: 'تصدير Excel', desc: 'تصدير التقارير إلى ملفات Excel' },
        ],
    },
    {
        id: 'admin',
        label: 'الإدارة',
        icon: Shield,
        perms: [
            { key: 'canManageUsers', kind: 'page', label: 'إدارة الفريق', desc: 'صفحتا الفريق والصلاحيات' },
            { key: 'canManageBranches', kind: 'page', label: 'إدارة الفروع', desc: 'صفحة الفروع وإعداداتها' },
            { key: 'canViewAuditLog', kind: 'page', label: 'سجل النشاطات', desc: 'صفحة سجل نشاطات المستخدمين' },
            { key: 'canChangeSettings', kind: 'page', label: 'الإعدادات', desc: 'صفحة إعدادات النظام' },
            { key: 'canBackup', kind: 'action', requires: 'canChangeSettings', label: 'النسخ الاحتياطي', desc: 'إنشاء واستعادة النسخ الاحتياطية' },
        ],
    },
];

const KIND_META = {
    page: {
        label: 'دخول صفحة',
        icon: DoorOpen,
        chip: 'bg-info/10 text-info border-info/25',
    },
    action: {
        label: 'إجراء',
        icon: MousePointerClick,
        chip: 'bg-warning/10 text-warning border-warning/25',
    },
} as const;

/** Label lookup for the "requires X" hint under dimmed dependent rows. */
const LABEL_BY_KEY: Partial<Record<keyof UserPermissions, string>> = Object.fromEntries(
    GROUPS.flatMap((g) => g.perms.map((p) => [p.key, p.label])),
);

const ALL_KEYS: (keyof UserPermissions)[] = GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export default function PermissionsEditor({ users }: { users: User[] }) {
    const [userList, setUserList] = useState<User[]>(users);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [perms, setPerms] = useState<UserPermissions | null>(null);
    const [savedPerms, setSavedPerms] = useState<UserPermissions | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set(GROUPS.map((g) => g.id)));

    const isDirty = useMemo(
        () => !!(perms && savedPerms && JSON.stringify(perms) !== JSON.stringify(savedPerms)),
        [perms, savedPerms]
    );

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return userList;
        return userList.filter((u) =>
            (u.name || '').toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (roleLabels[u.role] || u.role).includes(q) ||
            (u.branch?.name || '').toLowerCase().includes(q)
        );
    }, [userList, search]);

    const selectUser = (user: User) => {
        if (user.id === selectedUser?.id) return;
        if (isDirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد تجاهلها والانتقال؟')) return;
        const p = getUserPermissions(user);
        setSelectedUser(user);
        setPerms(p);
        setSavedPerms(p);
        setMessage(null);
    };

    const togglePerm = (key: keyof UserPermissions) => {
        if (!perms) return;
        setPerms({ ...perms, [key]: !perms[key] });
    };

    const setGroupAll = (keys: (keyof UserPermissions)[], value: boolean) => {
        if (!perms) return;
        const next = { ...perms };
        keys.forEach((k) => { next[k] = value; });
        setPerms(next);
    };

    const resetToDefault = () => {
        if (!selectedUser) return;
        setPerms(getDefaultPermissions(selectedUser.role));
    };

    const toggleGroup = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const allExpanded = expanded.size === GROUPS.length;
    const toggleAllGroups = () =>
        setExpanded(allExpanded ? new Set() : new Set(GROUPS.map((g) => g.id)));

    const savePermissions = async () => {
        if (!selectedUser || !perms) return;
        setSaving(true);
        setMessage(null);
        try {
            // حفظ الفروقات عن الافتراضي فقط
            const defaults = getDefaultPermissions(selectedUser.role);
            const overrides: Partial<UserPermissions> = {};
            for (const key of Object.keys(perms) as (keyof UserPermissions)[]) {
                if (perms[key] !== defaults[key]) overrides[key] = perms[key];
            }
            const permsString = Object.keys(overrides).length > 0 ? JSON.stringify(overrides) : null;

            const res = await fetch(`/api/users/${selectedUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: permsString }),
            });

            if (res.ok) {
                // مزامنة الحالة المحلية حتى تبقى التعديلات ظاهرة عند إعادة الاختيار
                setSavedPerms(perms);
                setUserList((prev) => prev.map((u) => u.id === selectedUser.id ? { ...u, permissions: permsString } : u));
                setSelectedUser((u) => u ? { ...u, permissions: permsString } : u);
                setMessage({ ok: true, text: 'تم حفظ الصلاحيات بنجاح' });
            } else {
                setMessage({ ok: false, text: 'حدث خطأ أثناء الحفظ' });
            }
        } catch {
            setMessage({ ok: false, text: 'تعذّر الاتصال بالخادم' });
        } finally {
            setSaving(false);
        }
    };

    const enabledCount = perms ? ALL_KEYS.filter((k) => perms[k]).length : 0;
    const totalCount = ALL_KEYS.length;

    return (
        <div className="space-y-4">
            {/* دليل الشارتين: دخول صفحة مقابل إجراء */}
            <div className="glass-card px-4 py-3 flex items-center gap-5 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${KIND_META.page.chip}`}>
                        <DoorOpen className="w-3 h-3" />
                        {KIND_META.page.label}
                    </span>
                    يتحكم بظهور الصفحة في القائمة وإمكانية فتحها
                </span>
                <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${KIND_META.action.chip}`}>
                        <MousePointerClick className="w-3 h-3" />
                        {KIND_META.action.label}
                    </span>
                    يتحكم بزر أو ميزة محددة داخل صفحة
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* قائمة المستخدمين */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h2 className="font-bold text-foreground font-cairo leading-tight">المستخدمون</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">{userList.length} مستخدم</p>
                    </div>
                </div>
                <div className="p-4">
                    <div className="relative mb-3">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="بحث بالاسم أو الدور أو الفرع..."
                            className="w-full rounded-lg border border-border bg-background text-foreground pr-9 pl-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                        />
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
                        {filteredUsers.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">لا يوجد مستخدمون مطابقون</p>
                        ) : filteredUsers.map((user) => {
                            const active = selectedUser?.id === user.id;
                            const customized = !!user.permissions;
                            return (
                                <button
                                    key={user.id}
                                    onClick={() => selectUser(user)}
                                    className={`w-full text-right p-3 rounded-lg border transition-colors ${active
                                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
                                        : 'bg-muted/40 border-border hover:bg-muted/70'
                                        }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-bold text-foreground truncate">{user.name || user.email}</div>
                                            <div className="text-xs text-muted-foreground truncate">{user.branch?.name || 'بدون فرع'}</div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${roleColors[user.role] || roleColors.CASHIER}`}>
                                                {roleLabels[user.role] || user.role}
                                            </span>
                                            {customized && (
                                                <span className="text-[10px] text-warning font-bold">صلاحيات مخصّصة</span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* محرّر الصلاحيات */}
            <div className="lg:col-span-2">
                {selectedUser && perms ? (
                    <div className="glass-card overflow-hidden">
                        {/* رأس المحرّر */}
                        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <UserCog className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h2 className="font-bold text-foreground font-cairo leading-tight truncate">{selectedUser.name || selectedUser.email}</h2>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${roleColors[selectedUser.role] || roleColors.CASHIER}`}>
                                            {roleLabels[selectedUser.role] || selectedUser.role}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{enabledCount} من {totalCount} صلاحية مفعّلة</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isDirty && (
                                    <span className="text-xs font-bold text-warning hidden sm:inline">تغييرات غير محفوظة</span>
                                )}
                                <button
                                    onClick={resetToDefault}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> الافتراضي
                                </button>
                                <button
                                    onClick={savePermissions}
                                    disabled={saving || !isDirty}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-3.5 h-3.5" /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                                </button>
                            </div>
                        </div>

                        {message && (
                            <div className={`mx-5 mt-4 flex items-center gap-2 p-3 rounded-lg text-sm font-bold ${message.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                {message.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                {message.text}
                            </div>
                        )}

                        {/* أدوات */}
                        <div className="px-5 pt-4 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{GROUPS.length} أقسام</p>
                            <button
                                onClick={toggleAllGroups}
                                className="text-xs font-bold text-primary hover:underline"
                            >
                                {allExpanded ? 'طي الكل' : 'توسيع الكل'}
                            </button>
                        </div>

                        {/* الأقسام */}
                        <div className="p-5 pt-3 space-y-2">
                            {GROUPS.map((group) => {
                                const keys = group.perms.map((p) => p.key);
                                const onCount = keys.filter((k) => perms[k]).length;
                                const allOn = onCount === keys.length;
                                const isOpen = expanded.has(group.id);
                                const GroupIcon = group.icon;
                                return (
                                    <div key={group.id} className="border border-border rounded-xl overflow-hidden">
                                        <div className="flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors">
                                            <button
                                                onClick={() => toggleGroup(group.id)}
                                                className="flex-1 flex items-center justify-between p-3 min-w-0"
                                            >
                                                <span className="flex items-center gap-2 font-bold text-foreground truncate">
                                                    <GroupIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                                                    {group.label}
                                                </span>
                                                <span className={`text-xs font-bold mr-2 ${allOn ? 'text-success' : onCount === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                                                    {onCount}/{keys.length}
                                                </span>
                                            </button>
                                            <div className="flex items-center gap-2 pl-3 shrink-0">
                                                <button
                                                    onClick={() => setGroupAll(keys, !allOn)}
                                                    className="text-[11px] font-bold text-primary hover:underline whitespace-nowrap"
                                                >
                                                    {allOn ? 'تعطيل الكل' : 'تفعيل الكل'}
                                                </button>
                                                <button onClick={() => toggleGroup(group.id)} className="text-muted-foreground p-1">
                                                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        {isOpen && (
                                            <div className="p-2 divide-y divide-border/60">
                                                {group.perms.map((meta) => {
                                                    const on = perms[meta.key];
                                                    const kind = KIND_META[meta.kind];
                                                    const KindIcon = kind.icon;
                                                    // الإجراء (أو الصفحة الفرعية) بلا أثر ما دامت صفحته الأم معطّلة
                                                    const parentOff = !!meta.requires && !perms[meta.requires];
                                                    return (
                                                        <div
                                                            key={meta.key}
                                                            className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-opacity ${parentOff ? 'opacity-45' : ''}`}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-sm font-bold text-foreground">{meta.label}</span>
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${kind.chip}`}>
                                                                        <KindIcon className="w-3 h-3" />
                                                                        {kind.label}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
                                                                {parentOff && (
                                                                    <p className="text-[11px] text-warning mt-0.5">
                                                                        بلا أثر حالياً — يتطلب تفعيل «{LABEL_BY_KEY[meta.requires!]}»
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                role="switch"
                                                                aria-checked={on}
                                                                onClick={() => togglePerm(meta.key)}
                                                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-success' : 'bg-muted-foreground/25'}`}
                                                            >
                                                                <span className={`absolute right-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? '-translate-x-5' : 'translate-x-0'}`} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="glass-card p-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">اختر مستخدماً من القائمة لتعديل صلاحياته</p>
                        <p className="text-sm text-muted-foreground mt-1">يمكنك تفعيل أو تعطيل كل صلاحية على حدة، أو إعادة الضبط للافتراضي حسب الدور</p>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
