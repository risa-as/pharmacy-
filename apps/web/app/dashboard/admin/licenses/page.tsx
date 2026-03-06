'use client';

import { useState, useEffect } from 'react';
import {
    KeyRound, Plus, Shield, ShieldOff, Monitor, MonitorOff,
    Copy, Check, Loader2, AlertTriangle, Trash2, RotateCcw,
    Building2, Eye, EyeOff
} from 'lucide-react';

interface License {
    id: string;
    licenseKey: string;
    branchId: string;
    hardwareId: string | null;
    deviceName: string | null;
    isActive: boolean;
    expiresAt: string | null;
    activatedAt: string | null;
    lastSeenAt: string | null;
    createdAt: string;
    branch: {
        id: string;
        name: string;
        organization?: { name: string } | null;
    };
}

const durationOptions = [
    { value: 1, label: 'شهر واحد' },
    { value: 3, label: '3 أشهر' },
    { value: 6, label: '6 أشهر' },
    { value: 12, label: 'سنة كاملة' },
    { value: 0, label: 'بدون انتهاء (دائم)' },
];

export default function AdminLicensesPage() {
    const [licenses, setLicenses] = useState<License[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
    const [selectedOrg, setSelectedOrg] = useState('');
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [modalError, setModalError] = useState('');

    const [selectedDuration, setSelectedDuration] = useState(12);

    // Existing branch form state
    const [selectedBranch, setSelectedBranch] = useState('');

    // Success result after provisioning
    const [provisionResult, setProvisionResult] = useState<{
        licenseKey: string;
        organizationName: string;
        ownerEmail: string;
    } | null>(null);

    // Fetch licenses
    const fetchLicenses = async () => {
        try {
            const res = await fetch('/api/admin/licenses');
            if (res.ok) {
                const data = await res.json();
                setLicenses(data);
            }
        } catch (e) {
            console.error('Failed to fetch licenses:', e);
        } finally {
            setLoading(false);
        }
    };

    // Fetch branches for the dropdown
    const fetchBranches = async () => {
        try {
            const res = await fetch('/api/branches');
            if (res.ok) {
                const data = await res.json();
                setBranches(Array.isArray(data) ? data : data.branches || []);
            }
        } catch (e) {
            console.error('Failed to fetch branches:', e);
        }
    };

    useEffect(() => {
        fetchLicenses();
        fetchBranches();
        fetchOrganizations();
    }, []);

    // Fetch organizations for the org selector
    const fetchOrganizations = async () => {
        try {
            const res = await fetch('/api/admin/organizations');
            if (res.ok) {
                const data = await res.json();
                setOrganizations(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('Failed to fetch organizations:', e);
        }
    };

    const resetModal = () => {
        setShowModal(false);
        setModalError('');
        setProvisionResult(null);
        setSelectedBranch('');
        setSelectedOrg('');
        setSelectedDuration(12);
    };

    // Generate license for existing branch
    const handleGenerate = async () => {
        if (!selectedBranch || !selectedOrg) return;
        setGenerating(true);
        setModalError('');
        try {
            const res = await fetch('/api/admin/licenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: selectedBranch,
                    organizationId: selectedOrg,
                    durationMonths: selectedDuration || null,
                }),
            });
            if (res.ok) {
                const newLicense = await res.json();
                setProvisionResult({
                    licenseKey: newLicense.licenseKey,
                    organizationName: newLicense.branch?.organization?.name || newLicense.branch?.name || '',
                    ownerEmail: '',
                });
                fetchLicenses();
            } else {
                const data = await res.json();
                setModalError(data.error || 'حدث خطأ غير متوقع');
            }
        } catch (e) {
            console.error('Failed to generate license:', e);
            setModalError('تعذر الاتصال بالسيرفر');
        } finally {
            setGenerating(false);
        }
    };

    // Toggle license active/inactive
    const handleToggle = async (license: License) => {
        setActionLoading(license.id);
        try {
            const res = await fetch(`/api/admin/licenses/${license.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !license.isActive }),
            });
            if (res.ok) {
                const updated = await res.json();
                setLicenses(licenses.map(l => l.id === updated.id ? updated : l));
            }
        } catch (e) {
            console.error('Failed to toggle license:', e);
        } finally {
            setActionLoading(null);
        }
    };

    // Unbind hardware
    const handleUnbind = async (license: License) => {
        if (!confirm('هل أنت متأكد من فصل ربط الجهاز؟ سيتمكن العميل من تفعيل الترخيص على جهاز آخر.')) return;
        setActionLoading(license.id);
        try {
            const res = await fetch(`/api/admin/licenses/${license.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unbindHardware: true }),
            });
            if (res.ok) {
                const updated = await res.json();
                setLicenses(licenses.map(l => l.id === updated.id ? updated : l));
            }
        } catch (e) {
            console.error('Failed to unbind hardware:', e);
        } finally {
            setActionLoading(null);
        }
    };

    // Delete license
    const handleDelete = async (license: License) => {
        if (!confirm(`هل تريد حذف الترخيص ${license.licenseKey} نهائياً؟`)) return;
        setActionLoading(license.id);
        try {
            const res = await fetch(`/api/admin/licenses/${license.id}`, { method: 'DELETE' });
            if (res.ok) {
                setLicenses(licenses.filter(l => l.id !== license.id));
            }
        } catch (e) {
            console.error('Failed to delete license:', e);
        } finally {
            setActionLoading(null);
        }
    };

    // Copy to clipboard
    const handleCopy = (key: string, id: string) => {
        navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const formatDate = (d: string | null) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('ar-IQ', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    };

    const isExpired = (d: string | null) => {
        if (!d) return false;
        return new Date(d) < new Date();
    };

    // Stats
    const totalActive = licenses.filter(l => l.isActive && !isExpired(l.expiresAt)).length;
    const totalBound = licenses.filter(l => l.hardwareId).length;
    const totalExpired = licenses.filter(l => isExpired(l.expiresAt)).length;

    const inputClass = "w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all";

    return (
        <div className="glass-card space-y-6 p-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                        <KeyRound className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">إدارة التراخيص</h1>
                        <p className="text-sm text-muted-foreground">توليد ومراقبة تراخيص تطبيق سطح المكتب</p>
                    </div>
                </div>
                <button
                    onClick={() => { resetModal(); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary/20"
                >
                    <Plus className="w-4 h-4" />
                    تشفير ترخيص لفرع
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-1">إجمالي التراخيص</div>
                    <div className="text-2xl font-bold text-foreground">{licenses.length}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-1">فعّال</div>
                    <div className="text-2xl font-bold text-success">{totalActive}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-1">مرتبط بجهاز</div>
                    <div className="text-2xl font-bold text-primary">{totalBound}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-1">منتهي الصلاحية</div>
                    <div className="text-2xl font-bold text-destructive">{totalExpired}</div>
                </div>
            </div>

            {/* ==================== Modal ==================== */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">

                        {/* Success Result */}
                        {provisionResult ? (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="mx-auto mb-3 w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
                                        <Check className="w-6 h-6 text-success" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">تم التأسيس بنجاح!</h2>
                                    {provisionResult.organizationName && (
                                        <p className="text-sm text-muted-foreground mt-1">{provisionResult.organizationName}</p>
                                    )}
                                </div>

                                <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                                    <div>
                                        <div className="text-xs text-muted-foreground mb-1">مفتاح الترخيص</div>
                                        <div className="flex items-center gap-2">
                                            <code className="font-mono text-base bg-background px-3 py-1.5 rounded-lg text-foreground tracking-widest border border-border flex-1 text-center">
                                                {provisionResult.licenseKey}
                                            </code>
                                            <button
                                                onClick={() => handleCopy(provisionResult.licenseKey, 'result')}
                                                className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                                title="نسخ"
                                            >
                                                {copiedId === 'result' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {provisionResult.ownerEmail && (
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-1">إيميل المالك</div>
                                            <div className="text-sm text-foreground" dir="ltr">{provisionResult.ownerEmail}</div>
                                        </div>
                                    )}
                                </div>

                                <p className="text-xs text-muted-foreground text-center">
                                    أرسل مفتاح الترخيص وبيانات الدخول للعميل ليتمكن من تفعيل التطبيق
                                </p>

                                <button
                                    onClick={resetModal}
                                    className="w-full px-4 py-2.5 bg-muted text-foreground rounded-xl text-sm hover:bg-muted/80 transition-all font-bold"
                                >
                                    إغلاق
                                </button>
                            </div>
                        ) : (
                            <>
                                <h3 className="font-bold text-foreground mb-4">توليد مفتاح ترخيص للفرع</h3>
                                {/* Error */}
                                {modalError && (
                                    <div className="mb-4 p-3 rounded-xl text-sm flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive/70">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <span>{modalError}</span>
                                    </div>
                                )}


                                <div className="space-y-3">
                                    {/* Organisation selector (required for DRM binding) */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">المؤسسة *</label>
                                        <select
                                            value={selectedOrg}
                                            onChange={e => { setSelectedOrg(e.target.value); setSelectedBranch(''); }}
                                            className={inputClass}
                                        >
                                            <option value="">اختر المؤسسة...</option>
                                            {organizations.map(org => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">الفرع</label>
                                        <select
                                            value={selectedBranch}
                                            onChange={e => setSelectedBranch(e.target.value)}
                                            className={inputClass}
                                            disabled={!selectedOrg}
                                        >
                                            <option value="">اختر الفرع...</option>
                                            {branches
                                                .filter((b: any) => !selectedOrg || b.organizationId === selectedOrg)
                                                .map((b: any) => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">مدة الاشتراك</label>
                                        <select
                                            value={selectedDuration}
                                            onChange={e => setSelectedDuration(Number(e.target.value))}
                                            className={inputClass}
                                        >
                                            {durationOptions.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>


                                {/* Actions */}
                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={handleGenerate}
                                        disabled={generating || !selectedBranch || !selectedOrg}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
                                    >
                                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                        {generating ? 'جاري المعالجة...' : 'توليد المفتاح'}
                                    </button>
                                    <button
                                        onClick={resetModal}
                                        className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm hover:bg-muted/80 transition-all"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ==================== Table ==================== */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : licenses.length > 0 ? (
                <div className="bg-card border border-border rounded-xl overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">مفتاح الترخيص</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الفرع / المؤسسة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الجهاز</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">الحالة</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">تاريخ الانتهاء</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">آخر اتصال</th>
                                <th className="text-right py-3 px-4 font-bold text-muted-foreground">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map(license => {
                                const expired = isExpired(license.expiresAt);
                                const isLoading = actionLoading === license.id;

                                return (
                                    <tr key={license.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <code className="font-mono text-xs bg-muted px-2 py-1 rounded-lg text-foreground tracking-wider">
                                                    {license.licenseKey}
                                                </code>
                                                <button
                                                    onClick={() => handleCopy(license.licenseKey, license.id)}
                                                    className="p-1 rounded-md hover:bg-muted transition-colors"
                                                    title="نسخ"
                                                >
                                                    {copiedId === license.id
                                                        ? <Check className="w-3.5 h-3.5 text-success" />
                                                        : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                                    }
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-foreground text-xs">{license.branch?.name}</div>
                                            {license.branch?.organization && (
                                                <div className="text-xs text-muted-foreground">{license.branch.organization.name}</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {license.hardwareId ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Monitor className="w-3.5 h-3.5 text-primary" />
                                                    <span className="text-xs text-foreground">{license.deviceName || 'مرتبط'}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <MonitorOff className="w-3.5 h-3.5 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">غير مرتبط</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {expired ? (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                                                    <AlertTriangle className="w-3 h-3" /> منتهي
                                                </span>
                                            ) : license.isActive ? (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                                                    <Shield className="w-3 h-3" /> فعّال
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                                    <ShieldOff className="w-3 h-3" /> موقوف
                                                </span>
                                            )}
                                        </td>
                                        <td className={`py-3 px-4 text-xs ${expired ? 'text-destructive' : 'text-muted-foreground'}`}>
                                            {formatDate(license.expiresAt)}
                                        </td>
                                        <td className="py-3 px-4 text-xs text-muted-foreground">
                                            {formatDate(license.lastSeenAt)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1">
                                                {isLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => handleToggle(license)}
                                                            className={`p-1.5 rounded-lg transition-colors text-xs ${license.isActive
                                                                ? 'hover:bg-destructive/10 text-destructive/70 hover:text-destructive'
                                                                : 'hover:bg-success/10 text-success/70 hover:text-success'
                                                                }`}
                                                            title={license.isActive ? 'إيقاف' : 'تفعيل'}
                                                        >
                                                            {license.isActive ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                                        </button>
                                                        {license.hardwareId && (
                                                            <button
                                                                onClick={() => handleUnbind(license)}
                                                                className="p-1.5 rounded-lg hover:bg-warning/10 text-warning hover:text-warning transition-colors"
                                                                title="فصل ربط الجهاز"
                                                            >
                                                                <RotateCcw className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(license)}
                                                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors"
                                                            title="حذف"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
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
                    <KeyRound className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لا توجد تراخيص بعد. قم بتأسيس أول صيدلية.</p>
                </div>
            )}
        </div>
    );
}
