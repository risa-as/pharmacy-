'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    HardDrive, Plus, Copy, Check, Loader2, AlertTriangle, Fingerprint,
    Store, Calendar, Infinity as InfinityIcon, X, KeyRound, Search,
    RefreshCw, Ban, RotateCcw, Trash2, Clock, FileText, ListChecks,
} from 'lucide-react';

interface OfflineLicense {
    id: string;
    pharmacyName: string;
    licensedTo: string | null;
    hardwareId: string;
    plan: string;
    expiresAt: string | null;
    licenseCode: string;
    notes: string | null;
    revoked: boolean;
    createdAt: string;
}

const durationOptions = [
    { value: 0, label: 'دائم (بدون انتهاء)' },
    { value: 365, label: 'سنة واحدة' },
    { value: 180, label: '6 أشهر' },
    { value: 90, label: '3 أشهر' },
    { value: 30, label: 'شهر واحد' },
];

const DAY = 86_400_000;

type StatusKey = 'perpetual' | 'active' | 'expiring' | 'expired' | 'revoked';

function computeStatus(lic: OfflineLicense): { key: StatusKey; label: string; cls: string } {
    if (lic.revoked) return { key: 'revoked', label: 'ملغى', cls: 'bg-destructive/10 text-destructive border-destructive/20' };
    if (lic.plan === 'PERPETUAL' || !lic.expiresAt) return { key: 'perpetual', label: 'دائم', cls: 'bg-success/10 text-success border-success/20' };
    const exp = new Date(lic.expiresAt).getTime();
    const now = Date.now();
    if (exp < now) return { key: 'expired', label: 'منتهٍ', cls: 'bg-muted text-muted-foreground border-border' };
    if (exp < now + 30 * DAY) return { key: 'expiring', label: 'قارب الانتهاء', cls: 'bg-warning/10 text-warning border-warning/20' };
    return { key: 'active', label: 'فعّال', cls: 'bg-success/10 text-success border-success/20' };
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-IQ') : '—');

export default function OfflineLicensesPage() {
    const [licenses, setLicenses] = useState<OfflineLicense[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
    const [planFilter, setPlanFilter] = useState<'all' | 'PERPETUAL' | 'ANNUAL'>('all');
    const [modal, setModal] = useState<{ mode: 'new' | 'reissue'; prefill?: Partial<OfflineLicense> } | null>(null);
    const [confirm, setConfirm] = useState<null | {
        title: string; message: string; confirmLabel: string; danger?: boolean; run: () => Promise<void>;
    }>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [rowBusy, setRowBusy] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/offline-licenses');
            const data = await res.json();
            if (res.ok) setLicenses(data.licenses || []);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { void load(); }, []);

    const copy = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
        } catch { /* clipboard unavailable */ }
    };

    const patchLicense = async (id: string, body: Record<string, unknown>) => {
        setRowBusy(id);
        try {
            const res = await fetch(`/api/admin/offline-licenses/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            if (res.ok) await load();
        } finally { setRowBusy(null); }
    };

    const deleteLicense = async (id: string) => {
        setRowBusy(id);
        try {
            const res = await fetch(`/api/admin/offline-licenses/${id}`, { method: 'DELETE' });
            if (res.ok) await load();
        } finally { setRowBusy(null); }
    };

    const stats = useMemo(() => {
        const s = { total: licenses.length, active: 0, expiring: 0, expired: 0, revoked: 0 };
        for (const l of licenses) {
            const k = computeStatus(l).key;
            if (k === 'revoked') s.revoked++;
            else if (k === 'expired') s.expired++;
            else if (k === 'expiring') { s.expiring++; s.active++; }
            else s.active++; // active + perpetual
        }
        return s;
    }, [licenses]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return licenses.filter((l) => {
            if (planFilter !== 'all' && l.plan !== planFilter) return false;
            if (statusFilter !== 'all' && computeStatus(l).key !== statusFilter) return false;
            if (!q) return true;
            return (
                l.pharmacyName.toLowerCase().includes(q) ||
                (l.licensedTo || '').toLowerCase().includes(q) ||
                l.hardwareId.toLowerCase().includes(q) ||
                (l.notes || '').toLowerCase().includes(q)
            );
        });
    }, [licenses, search, statusFilter, planFilter]);

    const statCards = [
        { label: 'الإجمالي', value: stats.total, cls: 'text-foreground', Icon: ListChecks },
        { label: 'فعّالة', value: stats.active, cls: 'text-success', Icon: Check },
        { label: 'قاربت الانتهاء', value: stats.expiring, cls: 'text-warning', Icon: Clock },
        { label: 'منتهية', value: stats.expired, cls: 'text-muted-foreground', Icon: Calendar },
        { label: 'ملغاة', value: stats.revoked, cls: 'text-destructive', Icon: Ban },
    ];

    const selectCls = 'h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <HardDrive className="w-6 h-6 text-primary" />
                        تراخيص النسخة الأوف لاين
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        توليد وإدارة أكواد تفعيل تطبيق سطح المكتب المستقل — مقفولة ببصمة جهاز الصيدلية وتعمل دون إنترنت
                    </p>
                </div>
                <button
                    onClick={() => setModal({ mode: 'new' })}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                >
                    <Plus className="h-4 w-4" /> توليد ترخيص جديد
                </button>
            </div>

            {/* KPI stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {statCards.map((c) => {
                    const Icon = c.Icon;
                    return (
                        <div key={c.label} className="bg-muted/40 border border-border rounded-xl p-3">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <Icon className="w-3.5 h-3.5" /> {c.label}
                            </div>
                            <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* How it works */}
            <div className="bg-info/10 border border-info/30 rounded-xl p-4 text-sm text-info flex items-start gap-2">
                <Fingerprint className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="opacity-90 leading-relaxed">
                    يفتح صاحب الصيدلية التطبيق فتظهر له <b>بصمة الجهاز</b>. يرسلها لك، تلصقها هنا مع اسم الصيدلية والنوع،
                    ثم تُرسل له الكود ليلصقه في شاشة التفعيل. الكود لا يعمل على أي جهاز آخر ولا يحتاج إنترنت.
                    <span className="block mt-1 text-info/80">
                        ملاحظة: «الإلغاء» هنا للسجل فقط — التحقق يتم أوف‑لاين، فلا يمكن تعطيل جهاز فُعِّل مسبقاً عن بُعد. الترخيص السنوي ينتهي محلياً في موعده.
                    </span>
                </p>
            </div>

            {/* Toolbar: search + filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث باسم الصيدلية أو المالك أو بصمة الجهاز..."
                        className="w-full h-10 rounded-lg border border-border bg-background pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={selectCls}>
                    <option value="all">كل الحالات</option>
                    <option value="active">فعّال</option>
                    <option value="perpetual">دائم</option>
                    <option value="expiring">قارب الانتهاء</option>
                    <option value="expired">منتهٍ</option>
                    <option value="revoked">ملغى</option>
                </select>
                <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as any)} className={selectCls}>
                    <option value="all">كل الأنواع</option>
                    <option value="PERPETUAL">دائم</option>
                    <option value="ANNUAL">مؤقّت</option>
                </select>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    <h2 className="font-bold text-foreground">التراخيص المُصدَرة</h2>
                    <span className="mr-auto text-xs text-muted-foreground">
                        {filtered.length}{filtered.length !== licenses.length ? ` من ${licenses.length}` : ''} ترخيص
                    </span>
                </div>

                {loading ? (
                    <div className="p-12 flex items-center justify-center text-muted-foreground gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <HardDrive className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">
                            {licenses.length === 0 ? 'لا توجد تراخيص مُصدَرة بعد' : 'لا نتائج مطابقة للبحث/الفلترة'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {licenses.length === 0 ? 'ابدأ بتوليد ترخيص لأول صيدلية' : 'جرّب تغيير كلمة البحث أو الفلاتر'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border">
                                <tr>
                                    <th className="px-5 py-3.5 text-right font-medium font-cairo">الصيدلية</th>
                                    <th className="px-5 py-3.5 text-right font-medium font-cairo">بصمة الجهاز</th>
                                    <th className="px-5 py-3.5 text-right font-medium font-cairo">الحالة</th>
                                    <th className="px-5 py-3.5 text-right font-medium font-cairo">الإصدار / الانتهاء</th>
                                    <th className="px-5 py-3.5 text-center font-medium font-cairo">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map((lic) => {
                                    const st = computeStatus(lic);
                                    const busy = rowBusy === lic.id;
                                    return (
                                        <tr key={lic.id} className={`hover:bg-muted/50 transition-colors ${lic.revoked ? 'opacity-60' : ''}`}>
                                            <td className="px-5 py-3.5">
                                                <p className="font-semibold text-foreground">{lic.pharmacyName}</p>
                                                {lic.licensedTo && <p className="text-xs text-muted-foreground">{lic.licensedTo}</p>}
                                                {lic.notes && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                                        <FileText className="w-3 h-3 shrink-0" /> {lic.notes}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-xs text-muted-foreground max-w-[150px] truncate" dir="ltr" title={lic.hardwareId}>
                                                        {lic.hardwareId}
                                                    </span>
                                                    <button onClick={() => copy(`hw-${lic.id}`, lic.hardwareId)} title="نسخ بصمة الجهاز"
                                                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                                        {copiedId === `hw-${lic.id}` ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${st.cls}`}>
                                                    {st.key === 'perpetual' ? <InfinityIcon className="w-3 h-3" /> : st.key === 'revoked' ? <Ban className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-xs text-muted-foreground">
                                                <div>صدر: {fmtDate(lic.createdAt)}</div>
                                                <div>{lic.expiresAt ? `ينتهي: ${fmtDate(lic.expiresAt)}` : 'بدون انتهاء'}</div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button onClick={() => copy(lic.id, lic.licenseCode)} title="نسخ كود التفعيل"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold hover:bg-primary/10 hover:text-primary transition-colors">
                                                        {copiedId === lic.id ? <><Check className="w-3.5 h-3.5 text-success" /> نُسخ</> : <><Copy className="w-3.5 h-3.5" /> الكود</>}
                                                    </button>
                                                    <button onClick={() => setModal({ mode: 'reissue', prefill: lic })} title="إعادة إصدار لجهاز جديد"
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" disabled={busy}>
                                                        <RefreshCw className="w-4 h-4" />
                                                    </button>
                                                    {lic.revoked ? (
                                                        <button onClick={() => void patchLicense(lic.id, { revoked: false })} title="إعادة تفعيل (سجل)"
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors" disabled={busy}>
                                                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirm({
                                                                title: 'إلغاء الترخيص (للسجل)',
                                                                message: `سيُعلَّم ترخيص «${lic.pharmacyName}» كملغى في السجل. تنبيه: التحقق يتم أوف‑لاين، لذا لن يتعطّل الجهاز المُفعَّل مسبقاً — هذا لأغراض التوثيق فقط.`,
                                                                confirmLabel: 'تعليم كملغى', danger: true,
                                                                run: () => patchLicense(lic.id, { revoked: true }),
                                                            })}
                                                            title="إلغاء (سجل)"
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors" disabled={busy}>
                                                            <Ban className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setConfirm({
                                                            title: 'حذف سجل الترخيص',
                                                            message: `سيُحذف سجل ترخيص «${lic.pharmacyName}» نهائياً من القائمة. لا يؤثر ذلك على جهاز فُعِّل مسبقاً، لكنك لن تستطيع إعادة نسخ الكود بعد الحذف.`,
                                                            confirmLabel: 'حذف', danger: true,
                                                            run: () => deleteLicense(lic.id),
                                                        })}
                                                        title="حذف السجل"
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" disabled={busy}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal && (
                <LicenseModal
                    mode={modal.mode}
                    prefill={modal.prefill}
                    onClose={() => setModal(null)}
                    onCreated={() => { setModal(null); void load(); }}
                />
            )}

            {confirm && (
                <ConfirmDialog
                    {...confirm}
                    busy={confirmBusy}
                    onCancel={() => setConfirm(null)}
                    onConfirm={async () => {
                        setConfirmBusy(true);
                        try { await confirm.run(); setConfirm(null); }
                        finally { setConfirmBusy(false); }
                    }}
                />
            )}
        </div>
    );
}

function LicenseModal({
    mode, prefill, onClose, onCreated,
}: { mode: 'new' | 'reissue'; prefill?: Partial<OfflineLicense>; onClose: () => void; onCreated: () => void }) {
    const [hardwareId, setHardwareId] = useState('');
    const [pharmacyName, setPharmacyName] = useState(prefill?.pharmacyName || '');
    const [licensedTo, setLicensedTo] = useState(prefill?.licensedTo || '');
    const [expiryDays, setExpiryDays] = useState(prefill?.plan === 'ANNUAL' ? 365 : 0);
    const [notes, setNotes] = useState(mode === 'reissue' ? 'إعادة إصدار لجهاز جديد' : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const generate = async () => {
        setError('');
        if (!hardwareId.trim()) { setError('الصق بصمة الجهاز.'); return; }
        if (!pharmacyName.trim()) { setError('أدخل اسم الصيدلية.'); return; }
        setBusy(true);
        try {
            const res = await fetch('/api/admin/offline-licenses', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hardwareId, pharmacyName, licensedTo, expiryDays, notes }),
            });
            const data = await res.json();
            if (res.ok) setResult(data.license.licenseCode);
            else setError(data.error || 'تعذر توليد الترخيص.');
        } catch { setError('حدث خطأ غير متوقع.'); }
        finally { setBusy(false); }
    };

    const copyResult = async () => {
        if (!result) return;
        try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1800); }
        catch { /* clipboard unavailable */ }
    };

    const field = 'w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

    return (
        <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
                    <h2 className="font-bold text-foreground flex items-center gap-2">
                        {mode === 'reissue' ? <RefreshCw className="w-5 h-5 text-primary" /> : <HardDrive className="w-5 h-5 text-primary" />}
                        {mode === 'reissue' ? 'إعادة إصدار لجهاز جديد' : 'توليد ترخيص أوف لاين'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
                </div>

                {result ? (
                    <div className="p-5 space-y-4">
                        <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-success text-sm font-bold flex items-center gap-2">
                            <Check className="w-4 h-4" /> تم توليد الترخيص بنجاح
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-foreground mb-2">كود التفعيل — أرسله للصيدلية</label>
                            <textarea readOnly value={result} rows={5} dir="ltr" className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono resize-none" />
                        </div>
                        <div className="flex justify-between gap-3">
                            <button onClick={copyResult} className="inline-flex items-center gap-2 px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                                {copied ? <><Check className="w-4 h-4" /> نُسخ</> : <><Copy className="w-4 h-4" /> نسخ الكود</>}
                            </button>
                            <button onClick={onCreated} className="px-5 h-10 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">تم</button>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 space-y-4">
                        {mode === 'reissue' && (
                            <div className="bg-info/10 border border-info/30 rounded-lg p-3 text-xs text-info flex items-start gap-2">
                                <RefreshCw className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>لتغيير جهاز الصيدلية: الصق بصمة الجهاز <b>الجديد</b>. البيانات معبّأة مسبقاً — يبقى الترخيص القديم في السجل.</span>
                            </div>
                        )}
                        <label className="text-sm space-y-1.5 block">
                            <span className="font-bold text-foreground flex items-center gap-1.5"><Fingerprint className="w-3.5 h-3.5" /> بصمة الجهاز *</span>
                            <input value={hardwareId} onChange={(e) => setHardwareId(e.target.value)} dir="ltr" placeholder="الصقها كما أرسلها الزبون" className={`${field} font-mono text-xs`} />
                        </label>
                        <label className="text-sm space-y-1.5 block">
                            <span className="font-bold text-foreground flex items-center gap-1.5"><Store className="w-3.5 h-3.5" /> اسم الصيدلية *</span>
                            <input value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} className={field} />
                        </label>
                        <label className="text-sm space-y-1.5 block">
                            <span className="font-bold text-foreground">اسم المالك (اختياري)</span>
                            <input value={licensedTo} onChange={(e) => setLicensedTo(e.target.value)} className={field} />
                        </label>
                        <label className="text-sm space-y-1.5 block">
                            <span className="font-bold text-foreground">نوع الترخيص</span>
                            <select value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} className={field}>
                                {durationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </label>
                        <label className="text-sm space-y-1.5 block">
                            <span className="font-bold text-foreground">ملاحظات (اختياري)</span>
                            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
                        </label>

                        {error && (
                            <div className="p-3 rounded-xl text-sm flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-1">
                            <button onClick={onClose} className="px-5 h-10 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
                            <button onClick={generate} disabled={busy} className="inline-flex items-center gap-2 px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
                                {busy && <Loader2 className="w-4 h-4 animate-spin" />} توليد الكود
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ConfirmDialog({
    title, message, confirmLabel, danger, busy, onCancel, onConfirm,
}: {
    title: string; message: string; confirmLabel: string; danger?: boolean; busy: boolean;
    onCancel: () => void; onConfirm: () => void;
}) {
    return (
        <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
            <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="font-bold text-foreground flex items-center gap-2">
                    <AlertTriangle className={`w-5 h-5 ${danger ? 'text-destructive' : 'text-warning'}`} /> {title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 h-10 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
                    <button onClick={onConfirm} disabled={busy}
                        className={`inline-flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${danger ? 'bg-destructive' : 'bg-warning'}`}>
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
