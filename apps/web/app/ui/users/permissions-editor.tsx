'use client';

import { useMemo, useState } from 'react';
import { Save, Shield, ChevronDown, ChevronUp, Search, RotateCcw, Check, AlertCircle, UserCog } from 'lucide-react';
import {
    getUserPermissions,
    getDefaultPermissions,
    PERMISSION_LABELS,
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

// تجميع الصلاحيات حسب الفئة (مرة واحدة)
const CATEGORIES: Record<string, (keyof UserPermissions)[]> = (() => {
    const cats: Record<string, (keyof UserPermissions)[]> = {};
    for (const [key, info] of Object.entries(PERMISSION_LABELS)) {
        (cats[info.category] ||= []).push(key as keyof UserPermissions);
    }
    return cats;
})();

export default function PermissionsEditor({ users }: { users: User[] }) {
    const [userList, setUserList] = useState<User[]>(users);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [perms, setPerms] = useState<UserPermissions | null>(null);
    const [savedPerms, setSavedPerms] = useState<UserPermissions | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set(Object.keys(CATEGORIES)));

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

    const setCategoryAll = (keys: (keyof UserPermissions)[], value: boolean) => {
        if (!perms) return;
        const next = { ...perms };
        keys.forEach((k) => { next[k] = value; });
        setPerms(next);
    };

    const resetToDefault = () => {
        if (!selectedUser) return;
        setPerms(getDefaultPermissions(selectedUser.role));
    };

    const toggleCategory = (category: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(category) ? next.delete(category) : next.add(category);
            return next;
        });
    };

    const allExpanded = expanded.size === Object.keys(CATEGORIES).length;
    const toggleAllCategories = () =>
        setExpanded(allExpanded ? new Set() : new Set(Object.keys(CATEGORIES)));

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

    const enabledCount = perms ? Object.values(perms).filter(Boolean).length : 0;
    const totalCount = Object.keys(PERMISSION_LABELS).length;

    return (
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
                            <p className="text-xs text-muted-foreground">{Object.keys(CATEGORIES).length} فئة</p>
                            <button
                                onClick={toggleAllCategories}
                                className="text-xs font-bold text-primary hover:underline"
                            >
                                {allExpanded ? 'طي الكل' : 'توسيع الكل'}
                            </button>
                        </div>

                        {/* الفئات */}
                        <div className="p-5 pt-3 space-y-2">
                            {Object.entries(CATEGORIES).map(([category, keys]) => {
                                const onCount = keys.filter((k) => perms[k]).length;
                                const allOn = onCount === keys.length;
                                const isOpen = expanded.has(category);
                                return (
                                    <div key={category} className="border border-border rounded-xl overflow-hidden">
                                        <div className="flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors">
                                            <button
                                                onClick={() => toggleCategory(category)}
                                                className="flex-1 flex items-center justify-between p-3 min-w-0"
                                            >
                                                <span className="font-bold text-foreground truncate">{category}</span>
                                                <span className={`text-xs font-bold mr-2 ${allOn ? 'text-success' : onCount === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                                                    {onCount}/{keys.length}
                                                </span>
                                            </button>
                                            <div className="flex items-center gap-2 pl-3 shrink-0">
                                                <button
                                                    onClick={() => setCategoryAll(keys, !allOn)}
                                                    className="text-[11px] font-bold text-primary hover:underline whitespace-nowrap"
                                                >
                                                    {allOn ? 'تعطيل الكل' : 'تفعيل الكل'}
                                                </button>
                                                <button onClick={() => toggleCategory(category)} className="text-muted-foreground p-1">
                                                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        {isOpen && (
                                            <div className="p-2 divide-y divide-border/60">
                                                {keys.map((key) => {
                                                    const on = perms[key];
                                                    return (
                                                        <label
                                                            key={key}
                                                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/40 cursor-pointer"
                                                        >
                                                            <span className="text-sm text-foreground">{PERMISSION_LABELS[key].label}</span>
                                                            <button
                                                                type="button"
                                                                role="switch"
                                                                aria-checked={on}
                                                                onClick={() => togglePerm(key)}
                                                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-success' : 'bg-muted-foreground/25'}`}
                                                            >
                                                                <span className={`absolute right-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? '-translate-x-5' : 'translate-x-0'}`} />
                                                            </button>
                                                        </label>
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
    );
}
