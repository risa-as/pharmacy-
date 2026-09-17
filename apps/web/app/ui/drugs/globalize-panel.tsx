'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Building2, Globe, Loader2, AlertTriangle, Check, ArrowLeftRight, Eye, Warehouse } from 'lucide-react';
import {
    globalizeOrganizationDrugs,
    globalizeWarehouseDrugs,
    type GlobalizeResult,
    type WarehouseGlobalizeResult,
} from '@/app/lib/actions/drugs-globalize';

export interface CustomDrugOrg {
    id: string;
    name: string;
    count: number;
}

/** نفس شكل CustomDrugOrg — نوع منفصل كي لا يُمرَّر مذخر مكان مؤسسة بالخطأ. */
export interface CustomDrugWarehouse {
    id: string;
    name: string;
    count: number;
}

type OwnerKind = 'ORG' | 'WAREHOUSE';

interface Target extends CustomDrugOrg {
    kind: OwnerKind;
}

/**
 * Promotes a tenant's private drugs into the shared catalogue. Listed per
 * organisation rather than hardcoded to one, so it stays usable as tenants come
 * and go — an organisation disappears from here once it has no private drugs left.
 *
 * ميزة نطاق المذخر: نفس اللوحة تخدم الآن بندين — المؤسسات والمذاخر. الميكانيكا
 * واحدة في الحالتين (تصفير حقل النطاق مع حفظ المعرّفات)، والمختلف هو حقل النطاق
 * وحده: organizationId للمؤسسات وwarehouseId للمذاخر.
 */
export default function GlobalizePanel({
    orgs,
    warehouses = [],
    activeOrgId = null,
    activeWarehouseId = null,
}: {
    orgs: CustomDrugOrg[];
    warehouses?: CustomDrugWarehouse[];
    /** Set when the table below is already filtered to one organisation. */
    activeOrgId?: string | null;
    /** نظيره للمذاخر — الجدول أدناه مُرشَّح على مذخر واحد. */
    activeWarehouseId?: string | null;
}) {
    const [target, setTarget] = useState<Target | null>(null);
    const [result, setResult] = useState<(GlobalizeResult | WarehouseGlobalizeResult) | null>(null);
    const [pending, startTransition] = useTransition();

    const run = () => {
        if (!target) return;
        const { kind, id } = target;
        startTransition(async () => {
            const res = kind === 'ORG'
                ? await globalizeOrganizationDrugs(id)
                : await globalizeWarehouseDrugs(id);
            setResult(res);
            setTarget(null);
        });
    };

    const promotedFrom = result?.success
        ? 'organizationName' in result ? result.organizationName : result.warehouseName
        : '';

    const renderGroup = (
        label: string,
        hint: string,
        rows: CustomDrugOrg[],
        kind: OwnerKind,
        activeId: string | null,
        emptyText: string,
    ) => (
        <div>
            <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-xs font-bold text-foreground">{label}</h3>
                <span className="text-[11px] text-muted-foreground">{hint}</span>
            </div>
            {rows.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-success shrink-0" />
                    {emptyText}
                </div>
            ) : (
                <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {rows.map((o) => {
                        const isActive = o.id === activeId;
                        const href = kind === 'ORG'
                            ? `/dashboard/admin/drugs?org=${encodeURIComponent(o.id)}`
                            : `/dashboard/admin/drugs?warehouse=${encodeURIComponent(o.id)}`;
                        const Icon = kind === 'ORG' ? Building2 : Warehouse;
                        return (
                            <li
                                key={o.id}
                                className={`flex items-center justify-between gap-3 px-3 py-2.5 ${isActive ? 'bg-primary/5' : 'bg-background'}`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm font-medium text-foreground truncate">{o.name}</span>
                                    <span className="text-xs text-muted-foreground bg-muted rounded-md px-2 py-0.5 shrink-0 font-mono">
                                        {o.count}
                                    </span>
                                    {isActive && (
                                        <span className="text-[11px] text-primary bg-primary/10 rounded-md px-2 py-0.5 shrink-0">
                                            معروضة الآن
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Link
                                        href={href}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        عرض الأدوية
                                    </Link>
                                    <button
                                        onClick={() => { setResult(null); setTarget({ ...o, kind }); }}
                                        disabled={pending}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                    >
                                        <Globe className="h-3.5 w-3.5" />
                                        تحويل إلى عام
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );

    return (
        <div className="rounded-xl border border-border bg-card p-4 mb-5">
            <div className="flex items-start gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
                    <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="font-bold text-foreground">تحويل أدوية مؤسسة أو مذخر إلى الكتالوج العالمي</h2>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        الأدوية التي أضافها مستأجر لنفسه تكون مرئية له فقط. التحويل يجعلها متاحة
                        للجميع — نفس السجلات، فلا يتأثر المخزون أو المبيعات المرتبطة بها.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {renderGroup(
                    'المؤسسات',
                    'أدوية أضافتها صيدلية لنفسها',
                    orgs,
                    'ORG',
                    activeOrgId,
                    'لا توجد أدوية خاصة بأي مؤسسة حالياً.',
                )}
                {renderGroup(
                    'المذاخر',
                    'أدوية أضافها مذخر ولا توجد في الكتالوج العالمي — تبقى داخلية عنده حتى ترقيتها',
                    warehouses,
                    'WAREHOUSE',
                    activeWarehouseId,
                    'لا توجد أدوية خاصة بأي مذخر حالياً.',
                )}
            </div>

            {/* Result banner */}
            {result && (
                <div
                    className={`mt-3 rounded-lg border px-3 py-2.5 text-sm flex items-start gap-2 ${result.success
                        ? 'bg-success/10 border-success/20 text-success'
                        : 'bg-destructive/10 border-destructive/20 text-destructive'
                        }`}
                >
                    {result.success ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                        {result.success ? (
                            <>
                                <span>
                                    تم تحويل <b className="font-mono">{result.promoted}</b> دواء من «{promotedFrom}» إلى الكتالوج العالمي.
                                </span>
                                {result.skipped.length > 0 && (
                                    <div className="mt-1 text-xs opacity-90">
                                        تُخطّي {result.skipped.length} دواء لوجود الباركود مسبقاً:{' '}
                                        {result.skipped.slice(0, 5).map((s) => s.tradeName).join('، ')}
                                        {result.skipped.length > 5 ? ' …' : ''}
                                    </div>
                                )}
                            </>
                        ) : (
                            <span>{result.error}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation */}
            {target && typeof document !== 'undefined' && createPortal(
                <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !pending && setTarget(null)}>
                    <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                            تأكيد التحويل
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            سيتم تحويل <b className="text-foreground font-mono">{target.count}</b> دواء من
                            «<b className="text-foreground">{target.name}</b>» إلى الكتالوج العالمي،
                            {target.kind === 'ORG'
                                ? ' فتصبح مرئية لجميع الصيدليات.'
                                : ' فتصبح مرئية للجميع وقابلة للطلب من الصيدليات عبر كتالوج المذخر.'}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 border border-border rounded-lg p-2.5">
                            الأدوية التي يوجد باركودها مسبقاً في الكتالوج العالمي سيتم تخطّيها تلقائياً
                            لتفادي التكرار. العملية مُسجَّلة في سجل التدقيق مع أرقام الأدوية المحوّلة.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setTarget(null)}
                                disabled={pending}
                                className="rounded-lg border border-border px-4 h-10 text-sm font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={run}
                                disabled={pending}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 h-10 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                {pending ? 'جاري التحويل...' : 'تأكيد التحويل'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
