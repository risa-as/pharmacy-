'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import type { AssistantCard, CardScope, ReorderCard, WasteCard, DailyCard } from '@/app/lib/ai-cards';
import { buildHandoff, saveHandoff } from '@/app/lib/smart-purchasing-handoff';
import { SETTINGS_SOURCE_LABEL, describeOptions } from '@/app/lib/purchase-planning-shared';
import { newDraftId, registerDraft } from '@/app/lib/purchase-draft-client';

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const rate = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

/** Where the numbers come from and what they cannot tell: shown with every card. */
function Scope({ scope }: { scope: CardScope }) {
    const [open, setOpen] = useState(false);
    const at = new Date(scope.generatedAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' });
    return (
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground" data-testid="card-scope">
            <div>
                النطاق: {scope.branchName}
                {scope.from && scope.to ? ` • بيانات ${scope.from} إلى ${scope.to}` : ''} • حُدّث {at}
            </div>
            {scope.notes.length > 0 && (
                <button onClick={() => setOpen(v => !v)} className="text-primary hover:underline">
                    {open ? 'إخفاء حدود البيانات' : 'حدود البيانات'}
                </button>
            )}
            {open && <ul className="list-disc pr-4 mt-1 space-y-0.5">{scope.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </div>
    );
}

function ReorderView({ card }: { card: ReorderCard }) {
    const router = useRouter();
    const { data: session } = useSession();
    const draftable = card.lines.filter(l => l.suggestedQty > 0 && l.unitsPerPack);
    const [preparing, setPreparing] = useState(false);

    const draft = async () => {
        const userId = (session?.user as any)?.id as string | undefined;
        const organizationId = (session?.user as any)?.organizationId as string | undefined;
        if (!userId || !organizationId || !card.scope.branchId) { toast.error('تعذر تحديد الحساب أو الفرع'); return; }
        if (preparing) return;
        setPreparing(true);
        try {
            // OPEN-14: register the draft for measurement; never a reason not to open the form.
            const id = newDraftId();
            const { source, ...options } = card.options;
            const measured = await registerDraft({
                id, branchId: card.scope.branchId, source: 'AI_CARD', settingsSource: source, options,
                lines: draftable.map(l => ({ drugId: l.drugId, barcode: l.barcode, suggestedUnits: l.suggestedQty, draftUnits: l.suggestedQty, unitsPerPack: l.unitsPerPack! })),
            });
            if (!measured) toast.warning('تعذر تسجيل المسودة للقياس؛ ستُفتح للمراجعة بشكل عادي ولن تدخل إحصاءات المسودات.');
            const handoff = buildHandoff(card.scope.branchId, card.scope.generatedAt, draftable.map(l => ({
                drugId: l.drugId, tradeName: l.drugName, barcode: l.barcode, scientificName: l.scientificName,
                currentStock: l.currentStock, units: l.suggestedQty, unitsPerPack: l.unitsPerPack,
            })), measured ? id : null);
            if (!saveHandoff(userId, organizationId, handoff)) throw new Error('تعذر حفظ المسودة في المتصفح');
            // Opens the order form pre-filled; nothing is sent until the user reviews and approves it there.
            router.push('/dashboard/purchases/warehouse-orders/new');
        } catch (e: any) { toast.error(e?.message ?? 'تعذر إعداد المسودة'); }
        finally { setPreparing(false); }
    };

    return (
        <div className="space-y-2" data-testid="reorder-card">
            <div className="font-semibold text-foreground">{card.title}</div>
            <p className="text-[11px] text-muted-foreground" data-testid="reorder-settings">
                {SETTINGS_SOURCE_LABEL[card.options.source]}: {describeOptions(card.options)}. {card.options.source === 'CUSTOM' ? 'خاصة بهذا الطلب؛ لم تتغير الإعدادات المحفوظة.' : 'هي نفسها في صفحة الشراء الذكي، وتُحفظ من هناك.'}
            </p>
            {card.lines.length === 0 ? (
                <p className="text-xs">لا توجد أصناف تحتاج إعادة طلب بإعدادات البطاقة الحالية.</p>
            ) : (
                <ul className="space-y-1.5">
                    {card.lines.map(l => (
                        <li key={l.inventoryId} className="rounded-lg border border-border bg-background p-2 text-xs" data-testid="reorder-line">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">{l.out ? '🔴 ' : l.urgent ? '🟠 ' : ''}{l.drugName}</span>
                                <span className="shrink-0 font-semibold text-primary">
                                    {l.suggestedQty > 0 ? `${n(l.suggestedQty)} وحدة${l.packs ? ` (${l.packs} عبوة)` : ''}` : 'راجع'}
                                </span>
                            </div>
                            <div className="text-muted-foreground mt-0.5">{l.reasons.join(' • ')}</div>
                            {l.limits.length > 0 && <div className="text-amber-600 dark:text-amber-400 mt-0.5">⚠ {l.limits.join(' • ')}</div>}
                        </li>
                    ))}
                </ul>
            )}
            {card.totalCandidates > card.lines.length && (
                <p className="text-[11px] text-muted-foreground">يُعرض أهم {card.lines.length} من {card.totalCandidates} صنف.</p>
            )}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={draft}
                    disabled={!card.canDraft || draftable.length === 0 || preparing}
                    title={card.draftBlockedReason ?? ''}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="reorder-draft"
                >
                    إعداد مسودة طلب للمراجعة ({draftable.length})
                </button>
                {card.links.map(l => <Link key={l.href} href={l.href} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40">{l.label}</Link>)}
            </div>
            {!card.canDraft && card.draftBlockedReason && <p className="text-[11px] text-muted-foreground">المسودة غير متاحة: {card.draftBlockedReason}</p>}
            <p className="text-[11px] text-muted-foreground">المسودة لا تُرسل تلقائياً؛ تُفتح في صفحة طلب المذخر لتراجع الكميات والأسعار وتعتمدها.</p>
            <Scope scope={card.scope} />
        </div>
    );
}

function WasteView({ card }: { card: WasteCard }) {
    return (
        <div className="space-y-2" data-testid="waste-card">
            <div className="font-semibold text-foreground">{card.title}</div>
            <div className="text-xs">
                القيمة المعرضة (بالتكلفة): <span className="font-semibold text-foreground">{n(card.totalValueAtRisk)} د.ع</span>
                {card.unknownValueLines > 0 && ` + ${card.unknownValueLines} صنف بلا تكلفة`}
            </div>
            {card.lines.length === 0 ? (
                <p className="text-xs">لا يُتوقع انتهاء مخزون دون بيع خلال {card.windowDays} يوماً بمعدل البيع الحالي.</p>
            ) : (
                <ul className="space-y-1.5">
                    {card.lines.map(l => (
                        <li key={l.branchId + l.drugId} className="rounded-lg border border-border bg-background p-2 text-xs" data-testid="waste-line">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">{l.drugName}</span>
                                <span className="shrink-0">{l.valueAtRisk !== null ? `${n(l.valueAtRisk)} د.ع` : 'تكلفة غير مسجلة'}</span>
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                                {l.branchName} • {n(l.expectedUnsold)} وحدة متوقع عدم بيعها • أقرب انتهاء {l.nearestExpiry} • بيع {rate(l.averageDailySales)}/يوم
                            </div>
                            {l.unvaluedUnits > 0 && l.valueAtRisk !== null && <div className="text-amber-600 dark:text-amber-400 mt-0.5">⚠ {n(l.unvaluedUnits)} وحدة بلا تكلفة مسجلة غير داخلة في القيمة</div>}
                            {l.transfers.map((t, i) => (
                                <div key={i} className="text-primary mt-0.5" data-testid="waste-transfer">
                                    اقتراح للمراجعة: تحويل {n(t.quantity)} وحدة (دفعة تنتهي {t.expiryDate}) إلى {t.branchName} — يبيع {rate(t.averageDailySales)}/يوم، وصول متوقع {t.arrivalDate}
                                </div>
                            ))}
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap gap-2">
                {card.links.map(l => <Link key={l.href} href={l.href} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40">{l.label}</Link>)}
            </div>
            <Scope scope={card.scope} />
        </div>
    );
}

function DailyView({ card }: { card: DailyCard }) {
    const icon = { high: '🔴', medium: '🟠', info: '🔵' } as const;
    return (
        <div className="space-y-2" data-testid="daily-card">
            <div className="font-semibold text-foreground">{card.title}</div>
            <ol className="space-y-1.5">
                {card.signals.map(s => (
                    <li key={s.id} className="rounded-lg border border-border bg-background p-2 text-xs">
                        <div className="font-semibold text-foreground">{icon[s.severity]} {s.title}</div>
                        <div className="text-muted-foreground mt-0.5">{s.detail}</div>
                        {s.link && <Link href={s.link.href} className="text-primary hover:underline">{s.link.label}</Link>}
                    </li>
                ))}
            </ol>
            <Scope scope={card.scope} />
        </div>
    );
}

export function AssistantCardView({ card }: { card: AssistantCard }) {
    if (card.kind === 'reorder') return <ReorderView card={card} />;
    if (card.kind === 'waste') return <WasteView card={card} />;
    return <DailyView card={card} />;
}
