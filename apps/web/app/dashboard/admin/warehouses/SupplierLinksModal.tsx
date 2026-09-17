'use client';

// المرحلة 1 من ميزة «طلب الأدوية حسب الاحتياج»: نافذة ربط الموردين بمذخر.
//
// المشكلة التي تحلّها: عند اعتماد أول طلب من مذخر يُنشئ الجسر مورداً مرآةً جديداً
// باسم «مذخر على المنصة: X» بلا تاريخ أسعار. فإن كانت الصيدلية تشتري من هذا المذخر
// منذ سنة تحت اسم مورد محلي، بقي تاريخها كله معلقاً بالمورد القديم. الربط هنا
// يجعل الاعتماد يستعمل المورد الموجود بدل إنشاء نسخة.
//
// مفصولة عن page.tsx (859 سطراً أصلاً) عمداً — §296 من الخطة.
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Link2, AlertTriangle, Check, Building2, Search, X } from 'lucide-react';

interface OrganizationRow {
    id: string;
    name: string;
}

interface SupplierRow {
    id: string;
    name: string;
    phone: string | null;
    warehouseId: string | null;
}

interface LinkRow {
    id: string;
    name: string;
    phone: string | null;
    organizationId: string | null;
    organization: { id: string; name: string } | null;
}

const inputClass =
    'w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-colors';

export default function SupplierLinksModal({
    warehouse,
    onClose,
}: {
    warehouse: { id: string; name: string; isActive: boolean };
    onClose: () => void;
}) {
    const loadVersion = useRef(0);
    const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
    const [links, setLinks] = useState<LinkRow[]>([]);
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [orgId, setOrgId] = useState('');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<SupplierRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const load = useCallback(
        async (organizationId: string, q: string) => {
            const version = ++loadVersion.current;
            const url = new URL(
                `/api/admin/warehouses/${warehouse.id}/supplier-links`,
                window.location.origin
            );
            if (organizationId) url.searchParams.set('organizationId', organizationId);
            if (q) url.searchParams.set('search', q);
            const res = await fetch(url.toString());
            const data = await res.json();
            if (version !== loadVersion.current) return;
            if (!res.ok) {
                setError(data.error ?? 'فشل في جلب بيانات الربط');
                return;
            }
            setLinks(data.links ?? []);
            setSuppliers(data.suppliers ?? []);
        },
        [warehouse.id]
    );

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await fetch('/api/admin/organizations');
            if (res.ok) setOrgs(await res.json());
            await load('', '');
            setLoading(false);
        })();
    }, [load]);

    // تأخير قصير كي لا يُطلق كل حرف طلباً؛ ونتيجة الطلب القديم تُهمَل إن تغيّر
    // البحث قبل وصولها (نفس شرط §394: نتائج قديمة لا تستبدل الأحدث).
    useEffect(() => {
        if (!orgId) return;
        const t = setTimeout(() => {
            load(orgId, search).catch(() => setError('تعذر جلب الموردين'));
        }, 250);
        return () => {
            loadVersion.current++;
            clearTimeout(t);
        };
    }, [orgId, search, load]);

    const submit = async () => {
        if (!orgId || !picked) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/warehouses/${warehouse.id}/supplier-links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: orgId, supplierId: picked.id }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'فشل في ربط المورد');
                return;
            }
            setDone(
                data.alreadyLinked
                    ? `المورد «${picked.name}» مرتبط بهذا المذخر أصلاً.`
                    : `رُبط المورد «${picked.name}» بمذخر «${warehouse.name}».`
            );
            setPicked(null);
            await load(orgId, search);
        } finally {
            setSaving(false);
        }
    };

    const orgName = orgs.find((o) => o.id === orgId)?.name ?? '';

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            dir="rtl"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !saving && onClose()}
        >
            <div
                className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <Link2 className="h-5 w-5 text-primary" />
                            ربط الموردين — {warehouse.name}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            الربط يوجّه فواتير الطلبات الجديدة إلى المورد الموجود لدى المؤسسة فيحتفظ
                            بتاريخه وأسعاره. <b>لا ينقل أرصدة ولا يدمج سجلات ولا يغيّر أي فاتورة أو دين قائم.</b>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* الروابط القائمة */}
                        <div>
                            <h3 className="mb-2 text-xs font-bold text-foreground">الموردون المرتبطون بهذا المذخر</h3>
                            {links.length === 0 ? (
                                <p className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                                    لا يوجد أي مورد مرتبط بهذا المذخر بعد. الطلبات المعتمدة ستُنشئ مورداً
                                    جديداً باسم «مذخر على المنصة: {warehouse.name}» بلا تاريخ أسعار.
                                </p>
                            ) : (
                                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                                    {links.map((l) => (
                                        <li key={l.id} className="flex items-center justify-between gap-3 bg-background px-3 py-2 text-sm">
                                            <span className="truncate font-medium text-foreground">{l.name}</span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {l.organization?.name ?? 'مؤسسة محذوفة'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* اختيار المؤسسة */}
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-foreground">المؤسسة</label>
                            <select
                                value={orgId}
                                onChange={(e) => {
                                    setOrgId(e.target.value);
                                    setPicked(null);
                                    setDone(null);
                                    setError(null);
                                }}
                                className={inputClass}
                            >
                                <option value="">— اختر مؤسسة —</option>
                                {orgs.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </div>

                        {orgId && (
                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-foreground">
                                    موردو «{orgName}»
                                </label>
                                <div className="relative mb-2">
                                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="بحث بالاسم أو الهاتف…"
                                        className={`${inputClass} pr-9`}
                                    />
                                </div>
                                {suppliers.length === 0 ? (
                                    <p className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                                        لا موردون مطابقون في هذه المؤسسة.
                                    </p>
                                ) : (
                                    <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                                        {suppliers.map((s) => {
                                            const linkedHere = s.warehouseId === warehouse.id;
                                            const linkedElsewhere = !!s.warehouseId && !linkedHere;
                                            return (
                                                <li key={s.id}>
                                                    <button
                                                        onClick={() => !linkedElsewhere && setPicked(s)}
                                                        disabled={linkedElsewhere}
                                                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-right text-sm transition-colors ${
                                                            picked?.id === s.id
                                                                ? 'bg-primary/10'
                                                                : 'bg-background hover:bg-muted/50'
                                                        } disabled:cursor-not-allowed disabled:opacity-40`}
                                                    >
                                                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                                            {s.name}
                                                            {s.phone && (
                                                                <span className="mr-2 font-mono text-xs text-muted-foreground">{s.phone}</span>
                                                            )}
                                                        </span>
                                                        {linkedHere && (
                                                            <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">مرتبط</span>
                                                        )}
                                                        {linkedElsewhere && (
                                                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">مرتبط بمذخر آخر</span>
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}

                        {/* معاينة صريحة قبل التنفيذ (§166) */}
                        {picked && orgId && (
                            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <span className="text-foreground">
                                    المورد المحلي <b>«{picked.name}»</b> في مؤسسة <b>«{orgName}»</b> سيرتبط
                                    بمذخر <b>«{warehouse.name}»</b>.
                                </span>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        {done && (
                            <div className="flex items-start gap-2 rounded-md border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
                                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{done}</span>
                            </div>
                        )}

                        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                            لا يمكن فكّ الربط أو إعادة توجيهه من هذه الشاشة في هذه النسخة، لأن لذلك أثراً
                            على الطلبات الجارية. اختر المورد الصحيح قبل التأكيد.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={onClose}
                                disabled={saving}
                                className="h-10 rounded-md border border-border px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                            >
                                إغلاق
                            </button>
                            <button
                                onClick={submit}
                                disabled={saving || !picked || !orgId}
                                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                                تأكيد الربط
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
