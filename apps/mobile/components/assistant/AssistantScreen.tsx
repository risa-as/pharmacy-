import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ScreenHeader, HeaderIconButton } from '../ui/ScreenHeader';
import { StateBlock, Surface, usePalette } from '../ui/Kit';
import { AssistantButton as AppButton, AssistantText, MobileAssistantCard } from './AssistantCards';
import { assistantService } from '../../services/assistant';
import { getSessionGeneration } from '../../services/api';
import { assistantDestination, assistantHistory, canSendAssistant, coverageDays, EXAMPLE_CATEGORIES, MAX_ASSISTANT_MESSAGES, newAssistantDraftId, normalizeCoverage, purchaseMessage, QUICK_QUESTIONS, readAssistantConversation, readAssistantDraft, preparedAssistantDraftKey, rememberPreparedAssistantDraft, saveAssistantConversation, storeAssistantDraft, type AssistantMessage, type AssistantUsage, type ReorderCard } from '../../utils/assistant';

export interface AssistantScreenProps {
    userId: string;
    allowed: boolean;
    canPrepare: boolean;
    navigate: (destination: { pathname: string; params?: Record<string, string> }) => void;
}
export function AssistantScreen({ userId, allowed, canPrepare, navigate }: AssistantScreenProps) {
    const C = usePalette(); const insets = useSafeAreaInsets(); const net = useNetInfo();
    const offline = net.isConnected === false || net.isInternetReachable === false;
    const generation = getSessionGeneration(); const owner = `${userId}:${generation}`;
    const [messages, setMessages] = useState<AssistantMessage[]>(() => readAssistantConversation(owner));
    const [input, setInput] = useState(''); const [loading, setLoading] = useState(false);
    const [usage, setUsage] = useState<AssistantUsage | null>(null); const [configured, setConfigured] = useState(false);
    const [statusError, setStatusError] = useState(''); const [notice, setNotice] = useState('');
    const [examples, setExamples] = useState(false); const [category, setCategory] = useState(0);
    const [tools, setTools] = useState(false); const [purchase, setPurchase] = useState(false); const [days, setDays] = useState('');
    const scroll = useRef<ScrollView>(null); const lock = useRef(false); const mounted = useRef(true); const currentOwner = useRef(owner); currentOwner.current = owner;
    const valid = () => currentOwner.current === owner && getSessionGeneration() === generation;
    const apply = (next: AssistantMessage[]) => { if (!valid()) return; saveAssistantConversation(owner, next); if (mounted.current) setMessages(next); };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { lock.current = false; setLoading(false); setMessages(readAssistantConversation(owner)); setUsage(null); setConfigured(false); setStatusError(''); setInput(''); setPurchase(false); setTools(false); setExamples(false); setNotice(''); }, [owner]);
    const refreshStatus = useCallback(async () => {
        if (!allowed) return;
        try {
            const [status, quota] = await Promise.all([assistantService.status(), assistantService.usage()]);
            if (currentOwner.current !== owner || !mounted.current) return;
            setConfigured(status.configured); setUsage(quota); setStatusError('');
        } catch (e) { if (currentOwner.current === owner && mounted.current) setStatusError(e instanceof Error ? e.message : 'تعذر تحديث حالة المساعد'); }
    }, [allowed, owner]);
    useEffect(() => { void refreshStatus(); }, [refreshStatus]);
    const send = async (raw: string) => {
        const message = raw.trim();
        if (!allowed || lock.current || offline || !canSendAssistant(message, configured, usage?.remaining, messages.length)) return;
        lock.current = true; setLoading(true); setInput(''); setPurchase(false); setExamples(false); setTools(false); setNotice('');
        const history = assistantHistory(messages);
        const pending: AssistantMessage[] = [...messages, { id: newAssistantDraftId(), role: 'user', content: message }]; apply(pending);
        try {
            const data = await assistantService.chat(message, history);
            apply([...pending, { id: newAssistantDraftId(), role: 'assistant', content: data.response ?? data.notice ?? data.error ?? '', cards: data.cards }]);
        } catch (e) { apply([...pending, { id: newAssistantDraftId(), role: 'assistant', content: e instanceof Error ? e.message : 'تعذر الاتصال. حاول مجدداً.', retry: message }]); }
        finally { if (valid()) { lock.current = false; if (mounted.current) { setLoading(false); void refreshStatus(); } } }
    };
    const insight = async (kind: 'reorder' | 'waste' | 'daily', label: string) => {
        if (!allowed || lock.current || offline || messages.length >= MAX_ASSISTANT_MESSAGES) return;
        lock.current = true; setLoading(true); setTools(false); setPurchase(false); setExamples(false);
        const pending: AssistantMessage[] = [...messages, { id: newAssistantDraftId(), role: 'user', content: label }]; apply(pending);
        try { const data = await assistantService.insight(kind); apply([...pending, { id: newAssistantDraftId(), role: 'assistant', content: '', cards: [data.card] }]); }
        catch (e) { apply([...pending, { id: newAssistantDraftId(), role: 'assistant', content: e instanceof Error ? e.message : 'تعذر إعداد البطاقة' }]); }
        finally { if (valid()) { lock.current = false; if (mounted.current) setLoading(false); } }
    };
    const prepare = async (card: ReorderCard) => {
        if (offline || !canPrepare) throw new Error(offline ? 'يلزم الاتصال بالإنترنت لإعداد المسودة' : 'ليس لديك صلاحية إنشاء طلب مذخر');
        const existing = preparedAssistantDraftKey(owner, card);
        if (existing) {
            if (!readAssistantDraft(owner, existing)) throw new Error('المسودة السابقة أُرسلت أو لم تعد متاحة؛ اطلب اقتراحاً جديداً من المساعد.');
            navigate({ pathname: '/warehouse-orders', params: { assistantDraft: existing } });
            return;
        }
        const result = await assistantService.prepareDraft(card);
        if (!valid()) throw new Error('تغيرت الجلسة؛ افتح المساعد من الحساب الحالي');
        const key = storeAssistantDraft(owner, result.draft);
        rememberPreparedAssistantDraft(owner, card, key);
        setNotice(result.measured ? '✓ تم إنشاء المسودة للمراجعة؛ لم يُرسل طلب الشراء بعد.' : 'تم تجهيز المسودة للمراجعة، لكن تعذر تسجيلها في إحصاءات المسودات.');
        navigate({ pathname: '/warehouse-orders', params: { assistantDraft: key } });
    };
    const go = (href: string) => {
        if (href === '/dashboard/reports/shifts') { void send('ما ملخص الشيفت الحالي؟'); return; }
        const destination = assistantDestination(href);
        if (destination) navigate(destination); else setNotice('هذه الصفحة غير متاحة في تطبيق الهاتف حالياً.');
    };
    const selectPurchase = () => { setTools(false); setExamples(false); setPurchase(true); setDays(''); };
    const clear = () => Alert.alert('بدء محادثة جديدة؟', 'سيتم مسح الرسائل من جلسة التطبيق الحالية.', [{ text: 'إلغاء', style: 'cancel' }, { text: 'مسح', onPress: () => { if (!lock.current) { apply([]); setPurchase(false); setNotice(''); } } }]);
    const limit = messages.length >= MAX_ASSISTANT_MESSAGES;
    const text = { color: C.foreground, fontSize: 14, lineHeight: 24, textAlign: 'right' as const };
    if (!allowed) return <View style={{ flex: 1, backgroundColor: C.background }}><ScreenHeader title="المساعد الذكي" /><StateBlock icon="lock-closed-outline" title="المساعد متاح لمدير المؤسسة" message="تُطبق الصلاحيات نفسها المستخدمة في موقع الويب." /></View>;
    return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="مساعد فاراماس" subtitle={usage ? `${usage.remaining} من ${usage.limit} إجابة متبقية اليوم` : 'مبيعاتك ومخزونك في محادثة واحدة'} action={<View style={{ flexDirection: 'row', gap: 5 }}><HeaderIconButton icon="bulb-outline" accessibilityLabel="أمثلة على الأسئلة" onPress={() => { setExamples(!examples); setTools(false); }} />{!!messages.length && <HeaderIconButton icon="trash-outline" accessibilityLabel="بدء محادثة جديدة" onPress={clear} />}</View>} />
        {offline && <Text accessibilityLiveRegion="polite" style={{ ...text, paddingHorizontal: 16, color: C.warning }}>أنت غير متصل. يمكنك قراءة المحادثة؛ يلزم الإنترنت لإرسال سؤال أو إعداد طلب.</Text>}
        {!!statusError && <View style={{ paddingHorizontal: 16, gap: 6 }}><Text style={{ ...text, color: C.danger }}>{statusError}</Text><AppButton compact variant="outline" label="تحديث حالة المساعد" onPress={() => void refreshStatus()} /></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={{ ...text, paddingHorizontal: 16, color: C.primary }}>{notice}</Text>}
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} onContentSizeChange={() => { if (!examples) scroll.current?.scrollToEnd({ animated: true }); }}>
            {examples ? <>
                <Text style={{ ...text, fontSize: 18, fontWeight: '800' }}>أمثلة على الأسئلة</Text>
                <Text style={{ ...text, color: C.mutedForeground }}>اختر الموضوع ثم السؤال لإرساله.</Text>
                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>{EXAMPLE_CATEGORIES.map((cat, i) => <TouchableOpacity key={cat.label} accessibilityRole="button" accessibilityState={{ selected: category === i }} onPress={() => setCategory(i)} style={{ width: '48%', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: category === i ? C.primary : C.border, backgroundColor: category === i ? C.primaryMuted : C.card }}><Text style={{ ...text, fontSize: 12 }}>{cat.icon} {cat.label}</Text></TouchableOpacity>)}</View>
                {EXAMPLE_CATEGORIES[category].questions.map(question => <AppButton key={question} variant="outline" label={question} disabled={loading || offline || !canSendAssistant(question, configured, usage?.remaining, messages.length)} onPress={() => void send(question)} />)}
                <AppButton compact variant="soft" label="العودة إلى المحادثة" onPress={() => setExamples(false)} />
            </> : <>
                {!messages.length && !purchase && <View style={{ gap: 16, paddingVertical: 16 }}>
                    <Ionicons name="sparkles-outline" size={36} color={C.primary} style={{ alignSelf: 'flex-end' }} />
                    <Text style={{ ...text, fontSize: 25, fontWeight: '900' }}>كيف أساعدك اليوم؟</Text>
                    <Text style={{ ...text, color: C.mutedForeground }}>اسأل عن أداء الصيدلية أو اختر أداة لتراجع المخزون وتجهّز طلب شراء.</Text>
                    <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>{QUICK_QUESTIONS.map(question => <View key={question} style={{ width: '48%' }}><AppButton variant="outline" label={question} disabled={loading || offline || !configured || usage?.remaining === 0} onPress={() => void send(question)} /></View>)}</View>
                    <AppButton label="طلب شراء ذكي" icon="cart-outline" variant="soft" onPress={selectPurchase} />
                    <AppButton label="استكشف أمثلة الأسئلة" variant="outline" icon="bulb-outline" onPress={() => setExamples(true)} />
                </View>}
                {messages.map(message => <View key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', width: message.cards?.length ? '100%' : undefined, maxWidth: message.cards?.length ? '100%' : '94%', gap: 10 }}>
                    {!!message.content && <View style={{ padding: 12, borderRadius: 12, backgroundColor: message.role === 'user' ? C.primaryMuted : C.card, borderWidth: 1, borderColor: C.border }}><Text style={{ ...text, color: C.mutedForeground, fontSize: 10 }}>{message.role === 'user' ? 'أنت' : 'مساعد فاراماس'}</Text><AssistantText>{message.content}</AssistantText></View>}
                    {message.cards?.map((card, i) => <MobileAssistantCard key={i} card={card} prepared={card.kind === 'reorder' && !!preparedAssistantDraftKey(owner, card)} canPrepare={canPrepare && !loading && !offline} prepare={prepare} navigate={go} />)}
                    {message.retry && <AppButton compact variant="outline" label="إعادة محاولة السؤال" disabled={loading || offline} onPress={() => void send(message.retry!)} />}
                </View>)}
                {purchase && <Surface style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ ...text, fontWeight: '800', fontSize: 17 }}>طلب شراء ذكي</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="إلغاء إعداد طلب الشراء" onPress={() => setPurchase(false)} style={{ padding: 10 }}><Ionicons name="close" size={22} color={C.mutedForeground} /></TouchableOpacity></View>
                    <Text style={text}>سأبحث عن الأدوية النافدة التي بيعت هذا الشهر. كم يوماً تريد أن تكفي الكمية المقترحة؟</Text>
                    <View style={{ flexDirection: 'row-reverse', gap: 6 }}>{[5, 10, 15, 20].map(n => <View key={n} style={{ flex: 1 }}><AppButton compact variant={days === String(n) ? 'primary' : 'outline'} label={`${n} أيام`} onPress={() => setDays(String(n))} /></View>)}</View>
                    <Text style={{ ...text, fontSize: 12 }}>أو أدخل مدة أخرى (من 1 إلى 365 يوماً)</Text>
                    <TextInput accessibilityLabel="عدد أيام التغطية" testID="assistant-coverage" value={days} onChangeText={v => setDays(normalizeCoverage(v))} keyboardType="number-pad" placeholder="عدد أيام التغطية" placeholderTextColor={C.mutedForeground} style={{ ...text, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.input }} />
                    {!!days && coverageDays(days) === null && <Text style={{ ...text, color: C.danger }}>أدخل عدداً صحيحاً من 1 إلى 365.</Text>}
                    <AppButton label="تجهيز الاقتراح" icon="cart-outline" disabled={coverageDays(days) === null || loading || offline || limit} onPress={() => void send(purchaseMessage(coverageDays(days)!))} />
                    <Text style={{ ...text, color: C.mutedForeground, fontSize: 12 }}>ستراجع الأصناف والكميات قبل إرسال الطلب إلى المذخر.</Text>
                </Surface>}
                {loading && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}><ActivityIndicator color={C.primary} /><Text style={{ ...text, color: C.mutedForeground }}>أراجع بيانات الصيدلية…</Text></View>}
                {!configured && !statusError && <Text style={{ ...text, color: C.mutedForeground, fontSize: 12 }}>الإجابات النصية غير متاحة حالياً. يمكنك استخدام أدوات المخزون وطلب الشراء.</Text>}
                {usage?.remaining === 0 && <Text style={{ ...text, color: C.mutedForeground, fontSize: 12 }}>اكتملت حصة الإجابات النصية. أدوات المخزون وطلب الشراء متاحة. تتجدد الحصة منتصف الليل بتوقيت بغداد.</Text>}
                {limit && <AppButton label="وصلت إلى 40 رسالة — ابدأ محادثة جديدة" variant="outline" onPress={clear} disabled={loading} />}
            </>}
        </ScrollView>
        {tools && <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card }}>
            <Text style={{ ...text, fontWeight: '800' }}>أدوات من بيانات الصيدلية</Text>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 }}>{[
                { label: 'طلب شراء ذكي', action: selectPurchase }, { label: 'احتياجات المخزون', action: () => void insight('reorder', 'احتياجات المخزون') },
                { label: 'المخزون المعرض للهدر', action: () => void insight('waste', 'المخزون المعرض للهدر') }, { label: 'ملخص اليوم', action: () => void insight('daily', 'ملخص اليوم') },
            ].map(tool => <View key={tool.label} style={{ width: '48%' }}><AppButton compact variant="soft" label={tool.label} onPress={tool.action} disabled={loading || limit} /></View>)}</View>
        </View>}
        <View style={{ padding: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="أدوات المساعد" accessibilityState={{ expanded: tools }} onPress={() => { setTools(!tools); setExamples(false); }} style={{ padding: 12, backgroundColor: C.input, borderRadius: 8 }}><Ionicons name="add" size={22} color={C.primary} /></TouchableOpacity>
                <TextInput accessibilityLabel="رسالتك للمساعد" multiline value={input} onChangeText={setInput} editable={!loading && !limit} placeholder="اكتب سؤالك أو اختر أداة…" placeholderTextColor={C.mutedForeground} maxLength={2000} style={{ ...text, flex: 1, maxHeight: 112, minHeight: 46, backgroundColor: C.input, borderRadius: 8, padding: 12, textAlignVertical: 'top' }} />
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="إرسال الرسالة" accessibilityState={{ disabled: loading || offline || !canSendAssistant(input, configured, usage?.remaining, messages.length) }} disabled={loading || offline || !canSendAssistant(input, configured, usage?.remaining, messages.length)} onPress={() => void send(input)} style={{ padding: 12, borderRadius: 8, backgroundColor: C.primary, opacity: loading || offline || !canSendAssistant(input, configured, usage?.remaining, messages.length) ? 0.4 : 1 }}><Ionicons name="send-outline" size={22} color="#fff" /></TouchableOpacity>
            </View>
        </View>
    </KeyboardAvoidingView>;
}
