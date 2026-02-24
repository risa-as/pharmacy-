'use client';

import { useState } from 'react';
import { Save, Shield, ChevronDown, ChevronUp } from 'lucide-react';
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

export default function PermissionsEditor({ users }: { users: User[] }) {
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [perms, setPerms] = useState<UserPermissions | null>(null);
    const [saving, setSaving] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [message, setMessage] = useState('');

    const selectUser = (user: User) => {
        setSelectedUser(user);
        setPerms(getUserPermissions(user));
        setMessage('');
    };

    const togglePerm = (key: keyof UserPermissions) => {
        if (!perms) return;
        setPerms({ ...perms, [key]: !perms[key] });
    };

    const resetToDefault = () => {
        if (!selectedUser) return;
        setPerms(getDefaultPermissions(selectedUser.role));
    };

    const savePermissions = async () => {
        if (!selectedUser || !perms) return;
        setSaving(true);
        try {
            // Only save overrides from defaults
            const defaults = getDefaultPermissions(selectedUser.role);
            const overrides: Partial<UserPermissions> = {};
            for (const key of Object.keys(perms) as (keyof UserPermissions)[]) {
                if (perms[key] !== defaults[key]) {
                    overrides[key] = perms[key];
                }
            }

            const res = await fetch(`/api/users/${selectedUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissions: Object.keys(overrides).length > 0 ? JSON.stringify(overrides) : null
                })
            });

            if (res.ok) {
                setMessage('✅ تم حفظ الصلاحيات بنجاح');
            } else {
                setMessage('❌ حدث خطأ في الحفظ');
            }
        } catch (e) {
            setMessage('❌ خطأ في الاتصال');
        } finally {
            setSaving(false);
        }
    };

    // Group permissions by category
    const categories: Record<string, (keyof UserPermissions)[]> = {};
    for (const [key, info] of Object.entries(PERMISSION_LABELS)) {
        if (!categories[info.category]) categories[info.category] = [];
        categories[info.category].push(key as keyof UserPermissions);
    }

    const roleLabels: Record<string, string> = {
        ADMIN: 'مدير',
        PHARMACIST: 'صيدلي',
        CASHIER: 'كاشير'
    };

    const roleColors: Record<string, string> = {
        ADMIN: 'bg-destructive/10 text-destructive',
        PHARMACIST: 'bg-primary/10 text-primary',
        CASHIER: 'bg-success/10 text-success'
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* User List */}
            <div className="bg-card rounded-xl border shadow-sm p-4">
                <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4" /> اختر مستخدم
                </h2>
                <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {users.map(user => (
                        <button
                            key={user.id}
                            onClick={() => selectUser(user)}
                            className={`w-full text-right p-3 rounded-lg border transition-colors ${selectedUser?.id === user.id
                                ? 'bg-primary/10 border-primary/50'
                                : 'bg-muted border-border hover:bg-muted'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-foreground">{user.name || user.email}</div>
                                    <div className="text-xs text-muted-foreground">{user.branch?.name || 'بدون فرع'}</div>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[user.role] || roleColors.CASHIER}`}>
                                    {roleLabels[user.role] || user.role}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Permissions Editor */}
            <div className="lg:col-span-2">
                {selectedUser && perms ? (
                    <div className="bg-card rounded-xl border shadow-sm p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="font-bold text-foreground">{selectedUser.name}</h2>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[selectedUser.role]}`}>
                                    {roleLabels[selectedUser.role]}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={resetToDefault}
                                    className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted">
                                    إعادة للافتراضي
                                </button>
                                <button onClick={savePermissions} disabled={saving}
                                    className="flex items-center gap-1 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                                    <Save className="w-3 h-3" /> {saving ? 'جاري الحفظ...' : 'حفظ'}
                                </button>
                            </div>
                        </div>

                        {message && (
                            <div className="mb-4 p-2 rounded-lg bg-muted text-sm text-center">{message}</div>
                        )}

                        <div className="space-y-2">
                            {Object.entries(categories).map(([category, keys]) => (
                                <div key={category} className="border rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                                        className="w-full flex items-center justify-between p-3 bg-muted hover:bg-muted"
                                    >
                                        <span className="font-medium text-foreground">{category}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {keys.filter(k => perms[k]).length}/{keys.length}
                                            </span>
                                            {expandedCategory === category ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                    </button>
                                    {expandedCategory === category && (
                                        <div className="p-3 space-y-2">
                                            {keys.map(key => (
                                                <label key={key}
                                                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted cursor-pointer">
                                                    <span className="text-sm text-foreground">{PERMISSION_LABELS[key].label}</span>
                                                    <button
                                                        onClick={() => togglePerm(key)}
                                                        className={`w-10 h-6 rounded-full transition-colors relative ${perms[key] ? 'bg-success' : 'bg-muted'
                                                            }`}
                                                    >
                                                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-all ${perms[key] ? 'right-0.5' : 'right-4'
                                                            }`} />
                                                    </button>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-card rounded-xl border shadow-sm p-16 text-center text-muted-foreground">
                        <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>اختر مستخدماً من القائمة لتعديل صلاحياته</p>
                    </div>
                )}
            </div>
        </div>
    );
}
