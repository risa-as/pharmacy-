import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton as KitButton, Surface, usePalette } from '../ui/Kit';
import type { AssistantCard, CardScope, ReorderCard } from '../../utils/assistant';
import { draftLines } from '../../utils/assistant';

const number = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
export function AssistantButton(props: React.ComponentProps<typeof KitButton>) {
    return <KitButton {...props} style={[{ minHeight: 44 }, props.style]} />;
}
const AppButton = AssistantButton;
export function AssistantText({ children }: { children: string }) {
    const C = usePalette();
    return <Text selectable style={{ color: C.foreground, fontSize: 14, lineHeight: 24, textAlign: 'right' }}>{children.split(/(\*\*[^*]+\*\*)/g).map((part, i) => <Text key={i} style={part.startsWith('**') ? { fontWeight: '800' } : undefined}>{part.startsWith('**') ? part.slice(2, -2) : part}</Text>)}</Text>;
}
function Scope({ scope }: { scope: CardScope }) {
    const C = usePalette(); const [open, setOpen] = useState(false);
    return <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 6 }}>
        <Text style={{ color: C.mutedForeground, fontSize: 11, lineHeight: 19, textAlign: 'right' }}>النطاق: {scope.branchName}{scope.from ? ` · ${scope.from} إلى ${scope.to}` : ''}{'\n'}حُدّث {new Date(scope.generatedAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}</Text>
        {!!scope.notes.length && <AppButton compact variant="soft" label={open ? 'إخفاء حدود البيانات' : 'حدود البيانات'} onPress={() => setOpen(!open)} />}
        {open && scope.notes.map((note, i) => <Text key={i} style={{ color: C.mutedForeground, fontSize: 12, lineHeight: 20, textAlign: 'right' }}>• {note}</Text>)}
    </View>;
}
export interface AssistantCardProps {
    card: AssistantCard;
    canPrepare: boolean;
    prepared?: boolean;
    prepare: (card: ReorderCard) => Promise<void>;
    navigate: (href: string) => void;
}
export function MobileAssistantCard({ card, canPrepare, prepared, prepare, navigate }: AssistantCardProps) {
    const C = usePalette(); const [shown, setShown] = useState(5);
    const [busy, setBusy] = useState(false); const [created, setCreated] = useState(!!prepared); const [error, setError] = useState(''); const lock = useRef(false);
    const text = { color: C.foreground, fontSize: 13, lineHeight: 22, textAlign: 'right' as const };
    const muted = { ...text, color: C.mutedForeground, fontSize: 12 };
    const lines = card.kind === 'daily' ? card.signals : card.lines;
    const makeDraft = async () => {
        if (card.kind !== 'reorder' || lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try { await prepare(card); setCreated(true); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إعداد المسودة'); }
        finally { lock.current = false; setBusy(false); }
    };
    const links = card.kind === 'daily' ? [] : card.links;
    return <Surface style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <Ionicons name={card.kind === 'reorder' ? 'cart-outline' : card.kind === 'waste' ? 'hourglass-outline' : 'today-outline'} size={22} color={C.primary} />
            <Text style={{ ...text, flex: 1, fontSize: 15, fontWeight: '800' }}>{card.title}</Text>
        </View>
        {card.kind === 'reorder' && <>
            <Text style={muted}>تغطية {card.options.coverageDays} يوماً {card.options.fromArrival ? 'من الوصول' : 'من اليوم'} · توريد {card.options.leadDays} يوم · أمان {card.options.safetyDays} يوم{card.options.source === 'CUSTOM' ? '\nقيم خاصة بهذا الطلب؛ لم تتغير الإعدادات المحفوظة.' : '\nالإعدادات نفسها المستخدمة في الشراء الذكي.'}</Text>
            <Text style={text}>المعروض: {card.lines.length} صنف · قابل للإضافة: {draftLines(card).length}</Text>
            {card.lines.length > draftLines(card).length && <Text style={{ ...muted, color: C.warning }}>لن يدخل {card.lines.length - draftLines(card).length} صنف المسودة لعدم تأكيد التعبئة أو عدم وجود كمية مقترحة.</Text>}
            {card.totalCandidates > card.lines.length && <Text style={muted}>يُعرض {card.lines.length} من {card.totalCandidates} صنف؛ المسودة تعتمد على الأصناف المعروضة فقط.</Text>}
        </>}
        {card.kind === 'waste' && <Text style={text}>القيمة المعرضة للهدر: {number(card.totalValueAtRisk)} د.ع{card.unknownValueLines ? ` · ${card.unknownValueLines} صنف بتكلفة غير مكتملة` : ''}{'\n'}نافذة التوقع: {card.windowDays} يوماً</Text>}
        {!lines.length && <Text style={muted}>{card.kind === 'reorder' ? 'لا توجد أصناف تحتاج إعادة طلب بهذه الإعدادات.' : card.kind === 'waste' ? 'لا يظهر هدر متوقع وفق البيانات الحالية.' : 'لا توجد إشارات لهذا اليوم.'}</Text>}
        {card.kind === 'reorder' && card.lines.slice(0, shown).map(line => <View key={line.inventoryId} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, gap: 5, backgroundColor: C.background }}>
            <Text style={{ ...text, fontWeight: '800' }}>{line.out ? '🔴 ' : line.urgent ? '🟠 ' : ''}{line.drugName}</Text>
            <Text style={{ ...text, color: C.primary, fontWeight: '700' }}>{number(line.suggestedQty)} وحدة{line.packs ? ` · ${number(line.packs)} عبوة` : ''}</Text>
            <Text style={muted}>{line.reasons.join(' · ')}</Text>
            {!!line.limits.length && <Text style={{ ...muted, color: C.warning }}>⚠ {line.limits.join(' · ')}</Text>}
        </View>)}
        {card.kind === 'waste' && card.lines.slice(0, shown).map(line => <View key={`${line.branchId}:${line.drugId}`} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, gap: 5, backgroundColor: C.background }}>
            <Text style={{ ...text, fontWeight: '800' }}>{line.drugName}</Text>
            <Text style={text}>{line.valueAtRisk === null ? 'تكلفة غير مسجلة' : `${number(line.valueAtRisk)} د.ع`} · {number(line.expectedUnsold)} وحدة متوقع عدم بيعها</Text>
            <Text style={muted}>{line.branchName} · أقرب انتهاء {line.nearestExpiry} · بيع {number(line.averageDailySales)} وحدة/يوم</Text>
            {!!line.unvaluedUnits && <Text style={{ ...muted, color: C.warning }}>{number(line.unvaluedUnits)} وحدة بتكلفة غير مسجلة</Text>}
            {line.transfers.map((transfer, i) => <Text key={i} style={{ ...muted, color: C.primary }}>اقتراح للمراجعة: تحويل {number(transfer.quantity)} وحدة إلى {transfer.branchName} · انتهاء {transfer.expiryDate} · وصول {transfer.arrivalDate} · يبيع {number(transfer.averageDailySales)} وحدة/يوم</Text>)}
        </View>)}
        {card.kind === 'daily' && card.signals.slice(0, shown).map(signal => <View key={signal.id} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, gap: 5 }}>
            <Text style={{ ...text, fontWeight: '800', color: signal.severity === 'high' ? C.danger : signal.severity === 'medium' ? C.warning : C.foreground }}>{signal.title}</Text>
            <Text style={muted}>{signal.detail}</Text>
            {signal.link && <AppButton compact variant="soft" label={signal.link.label} onPress={() => navigate(signal.link!.href)} />}
        </View>)}
        {lines.length > shown && <AppButton compact variant="outline" label={`عرض المزيد (${lines.length - shown} متبقٍ)`} onPress={() => setShown(n => n + 20)} />}
        {shown > 5 && <AppButton compact variant="soft" label="اختصار القائمة" onPress={() => setShown(5)} />}
        {card.kind === 'reorder' && <>
            <AppButton label={busy ? 'جارٍ تجهيز المسودة…' : created ? 'تم إنشاء المسودة — فتح للمراجعة' : `إعداد مسودة للمراجعة (الأصناف: ${draftLines(card).length})`} icon={created ? 'checkmark-circle-outline' : 'cart-outline'} loading={busy} disabled={!canPrepare || !card.canDraft || !draftLines(card).length} onPress={makeDraft} />
            {created && <Text accessibilityLiveRegion="polite" style={{ ...muted, color: C.success }}>✓ تم إنشاء المسودة. لم يُرسل طلب الشراء بعد.</Text>}
            {!!error && <Text accessibilityLiveRegion="polite" style={{ ...text, color: C.danger }}>{error}</Text>}
            {!card.canDraft && !!card.draftBlockedReason && <Text style={muted}>{card.draftBlockedReason}</Text>}
            <Text style={muted}>تُفتح المسودة في صفحة طلب المذخر لمراجعة الكميات والأسعار واختيار المذخر. لا تُرسل تلقائياً.</Text>
        </>}
        {links.map(link => <AppButton key={link.href} compact variant="outline" label={link.label} onPress={() => navigate(link.href)} />)}
        <Scope scope={card.scope} />
    </Surface>;
}
