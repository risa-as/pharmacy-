'use client';

// المرحلة 3: نافذة مقارنة أسعار الموردين لصنف واحد (§3.3).
//
//  §86 لكل مورد: آخر سعر مؤهل، تاريخه ومصدره، الفرع عند اختلافه، عمر السعر، وحالة
//      الربط بالمذخر.
//  §88 الترتيب تصاعدي بالسعر ثم بالأحدث ثم بمعرّف ثابت — يأتي مرتّباً من الخادم.
//  §89 الأقدم من 90 يوماً يُوسم تنبيهاً إرشادياً، ولا يُستبعد لمجرد قِدمه.
//  §90 الأسعار غير المؤهلة تُعرض **منفصلة** مع السبب ولا تشارك في إبراز الأرخص.
//  §91 «سجل الأسعار» يُجلب عند الطلب فقط ومرقّم الصفحات.
//  §92 يُذكر صراحةً أن هذا تاريخ بيانات مسجّلة وقد لا يشمل المحذوف.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, AlertTriangle, Clock, Link2, History, Info } from 'lucide-react';
import {
    type NeedLine,
    type SupplierPriceOption,
    QUALITY_LABEL,
    QUALITY_FIX,
    SOURCE_LABEL,
    formatIQD,
    formatDate,
    selectedOption,
} from './types';
// §302: القاعدة الحسابية الوحيدة لسعر الباكيت — لا ضرب مباشر مكرَّر هنا.
import { toPacketPrice } from '@/app/lib/pack-units';

interface PairHistory {
    batches: Array<{ id: string; price: number; recordedAt: string; branchId: string }>;
    purchases: Array<{ id: string; price: number; recordedAt: string; branchId: string }>;
    hasMore: boolean;
    page: number;
}

export default function PriceCompareModal({
    line,
    contextBranchId,
    onChoose,
    onClose,
}: {
    line: NeedLine;
    /** فرع الاستلام — يُظهر «مصدر السعر» فقط عند اختلافه عنه (§86/§148). */
    contextBranchId: string | null;
    onChoose: (supplierId: string) => void;
    onClose: () => void;
}) {
    const [historyFor, setHistoryFor] = useState<string | null>(null);
    const [history, setHistory] = useState<PairHistory | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const comparison = line.comparison;
    const unitsPerPack = line.unitsPerPack ?? null;
    const options = comparison?.options ?? [];
    const comparable = options.filter((o) => o.comparable);
    const nonComparable = options.filter((o) => !o.comparable);
    const chosen = selectedOption(line);

    const loadHistory = async (supplierId: string, page = 1) => {
        setHistoryFor(supplierId);
        setLoadingHistory(true);
        try {
            const url = new URL('/api/purchases/supplier-prices/history', window.location.origin);
            url.searchParams.set('drugId', line.drugId);
            url.searchParams.set('supplierId', supplierId);
            url.searchParams.set('page', String(page));
            const res = await fetch(url.toString());
            const data = await res.json();
            setHistory(res.ok ? data : null);
        } finally {
            setLoadingHistory(false);
        }
    };

    const renderRow = (o: SupplierPriceOption, rank: number | null) => {
        const isChosen = chosen?.supplierId === o.supplierId;
        return (
            <li
                key={o.supplierId || 'unattributed'}
                className={`px-3 py-3 ${isChosen ? 'bg-primary/5' : 'bg-background'}`}
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            {rank === 0 && (
                                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                                    الأرخص
                                </span>
                            )}
                            <span className="truncate text-sm font-medium text-foreground">{o.supplierName}</span>
                            {o.warehouseId ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                                    <Link2 className="h-3 w-3" />
                                    {o.warehouseName}
                                </span>
                            ) : (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                    غير مربوط بمذخر
                                </span>
                            )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>
                                {SOURCE_LABEL[o.source]}: {formatDate(o.recordedAt)}
                            </span>
                            {o.ageDays !== null && (
                                <span className={o.isStale ? 'flex items-center gap-1 text-amber-600' : ''}>
                                    {o.isStale && <Clock className="h-3 w-3" />}
                                    عمر السعر {o.ageDays} يوم{o.isStale ? ' — قديم' : ''}
                                </span>
                            )}
                            {contextBranchId && o.sourceBranchId !== contextBranchId && (
                                <span>مصدره فرع آخر</span>
                            )}
                        </div>

                        {/* السبب والعلاج مفصولان، وكلٌّ موسوم بعنوانه: «غير مؤهل»
                            يمنع الترشيح والإجمالي، و«الطلب الإلكتروني» شأن آخر
                            تماماً — خلطهما بلا وسم كان يجعل السبب غامضاً. */}
                        {o.qualityReason && (
                            <div className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                                <p className="flex items-start gap-1 text-[11px] font-bold text-amber-600">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                    غير مؤهل: {QUALITY_LABEL[o.qualityReason]}
                                </p>
                                <p className="mt-0.5 pr-4 text-[11px] text-muted-foreground">
                                    {QUALITY_FIX[o.qualityReason]}
                                </p>
                            </div>
                        )}
                        {!o.orderable && o.orderabilityReason && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                <span className="font-bold">الطلب الإلكتروني:</span> {o.orderabilityReason}
                            </p>
                        )}
                    </div>

                    <div className="shrink-0 text-left">
                        <div className="text-sm font-bold tabular-nums text-foreground">
                            {o.price !== null ? `${formatIQD(o.price)} د.ع` : '—'}
                        </div>
                        <div className="text-[11px] text-muted-foreground">لكل {o.unitLabel}</div>
                        {/* سعر الباكيت المُشتق — المذخر يسعّر بالباكيت، فعرضه هنا
                            يجعل المقارنة بالوحدة التي سيُساوم بها فعلاً. يظهر فقط متى
                            وُثّقت التعبئة — وبدونها لا يُخترَع رقم. toPacketPrice هي
                            القاعدة الوحيدة (§302) — لا ضرب مباشر هنا. */}
                        {(() => {
                            const packet = o.price !== null ? toPacketPrice(o.price, unitsPerPack) : null;
                            if (packet === null) return null;
                            return (
                                <div className="text-[11px] text-muted-foreground">
                                    الباكيت ({unitsPerPack}): <b className="text-foreground">{formatIQD(packet)}</b> د.ع
                                </div>
                            );
                        })()}
                        <div className="mt-2 flex items-center gap-2">
                            {o.supplierId && (
                                <button
                                    onClick={() => loadHistory(o.supplierId)}
                                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                                >
                                    <History className="h-3 w-3" />
                                    السجل
                                </button>
                            )}
                            {o.comparable && o.supplierId && (
                                <button
                                    onClick={() => onChoose(o.supplierId)}
                                    disabled={isChosen}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {isChosen ? <Check className="h-3 w-3" /> : null}
                                    {isChosen ? 'مختار' : 'اختر'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {historyFor === o.supplierId && (
                    <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5">
                        {loadingHistory ? (
                            <div className="flex items-center justify-center py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : !history ? (
                            <p className="text-[11px] text-muted-foreground">تعذّر جلب السجل.</p>
                        ) : (
                            <div className="space-y-2 text-[11px]">
                                <HistoryList title="سجلات الدفعات" rows={history.batches} />
                                <HistoryList title="سجلات الفواتير المكتملة" rows={history.purchases} />
                                {history.hasMore && (
                                    <button
                                        onClick={() => loadHistory(o.supplierId, history.page + 1)}
                                        className="text-primary hover:underline"
                                    >
                                        عرض المزيد
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </li>
        );
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div
                className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-foreground">أسعار الموردين — {line.tradeName}</h2>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{line.barcode || 'بلا باركود'}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {!comparison ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : !comparison.hasPrice && nonComparable.length === 0 ? (
                    <p className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                        لا يوجد سعر شراء مسجّل لهذا الصنف في بياناتك.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {comparable.length > 0 && (
                            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                                {comparable.map((o, i) => renderRow(o, i))}
                            </ul>
                        )}

                        {/* غير المؤهلة منفصلة تماماً ولا تنافس على الأرخص (§90) */}
                        {nonComparable.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-muted-foreground">
                                    سجلات غير مؤهلة للمقارنة
                                </h3>
                                <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
                                    أسعارها ظاهرة للمراجعة، لكنها لا تُرشَّح كأرخص ولا تدخل الإجمالي حتى يُعالَج السبب.
                                    قِدم التاريخ وحده لا يُسقط أي سعر.
                                </p>
                                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-dashed border-border">
                                    {nonComparable.map((o) => renderRow(o, null))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <p className="mt-4 flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    هذه أحدث الأسعار <b>المسجَّلة في بياناتك</b> — تاريخ تسجيل الدفعة أو الفاتورة،
                    وليس إثباتاً لتاريخ الشراء الفعلي. قد لا يشمل السجل عمليات حُذفت لاحقاً.
                    الأسعار تقديرية والسعر النهائي يؤكده المذخر عند تسعير الطلب.
                </p>
            </div>
        </div>,
        document.body
    );
}

function HistoryList({
    title,
    rows,
}: {
    title: string;
    rows: Array<{ id: string; price: number; recordedAt: string }>;
}) {
    return (
        <div>
            <p className="font-bold text-foreground">{title}</p>
            {rows.length === 0 ? (
                <p className="text-muted-foreground">لا سجلات.</p>
            ) : (
                <ul className="mt-1 space-y-0.5">
                    {rows.map((r) => (
                        <li key={r.id} className="flex justify-between gap-3 text-muted-foreground">
                            <span>{formatDate(r.recordedAt)}</span>
                            <span className="tabular-nums">{formatIQD(r.price)} د.ع</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
