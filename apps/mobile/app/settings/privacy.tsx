import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { usePalette, Surface, SectionTitle, AppButton, InfoNote, ListRow } from '../../components/ui/Kit';
import { Text } from '../../components/ui/Typography';
import { aiConsent } from '../../services/ai-consent';
import { request, getSessionGeneration } from '../../services/api';
import { readPrivateValue, writePrivateValue, removePrivateValue } from '../../services/private-storage';
import { newAssistantDraftId } from '../../utils/assistant';
import type { AIScope } from '../../utils/ai-consent';

type PrivacyRequest = { id: string; status: string; response: string; createdAt: string };
const statuses: Record<string, string> = { REQUESTED: 'بانتظار المراجعة', IN_REVIEW: 'قيد التحقق والمعالجة', COMPLETED: 'أُنجزت المعالجة', REJECTED: 'تعذر التنفيذ؛ راجع الرد' };
export default function PrivacyScreen() {
    const C = usePalette(); const { user } = useAuth();
    const [consents, setConsents] = useState<Partial<Record<AIScope, { granted: boolean; recipient: string }>>>({});
    const [requests, setRequests] = useState<PrivacyRequest[]>([]);
    const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
    const owner = `${user?.id}:${getSessionGeneration()}`; const current = useRef(owner); current.current = owner;
    const lock = useRef(false);
    async function load() {
        const rows = await request<PrivacyRequest[]>('/mobile/privacy-requests', { cache: 'no-store' });
        if (current.current === owner) setRequests(rows);
        for (const scope of ['prescription', 'assistant'] as AIScope[]) {
            try { const result = await aiConsent.status(scope); if (current.current === owner) setConsents(old => ({ ...old, [scope]: { granted: result.granted, recipient: result.disclosure.recipient } })); }
            catch { if (current.current === owner) setConsents(old => ({ ...old, [scope]: undefined })); }
        }
    }
    useEffect(() => { void load().catch(() => { if (current.current === owner) setError('تعذر تحميل حالة الخصوصية. حدّث الشاشة أو تواصل مع الدعم دون مسح بيانات التطبيق.'); }); return () => { if (current.current === owner) current.current = ''; }; }, [owner]);
    async function revoke(scope: AIScope) {
        setBusy(true); setError('');
        try { await aiConsent.revoke(scope); if (current.current !== owner) return; setConsents(old => ({ ...old, [scope]: { granted: false, recipient: old[scope]?.recipient ?? '' } })); setNotice('سُحبت الموافقة على هذا الجهاز. لا يمكن استرجاع بيانات أُرسلت سابقاً أو طلب بدأ إرساله؛ يمكن طلب حذفها منفصلاً.'); }
        catch { if (current.current === owner) setError('تعذر تأكيد سحب الموافقة؛ حاول مجدداً.'); }
        finally { if (current.current === owner) setBusy(false); }
    }
    async function submitRequest() {
        if (lock.current || !user?.id) return;
        lock.current = true; setBusy(true); setError(''); setNotice('');
        const key = `privacy_request_${user.id}`;
        try {
            let id = await readPrivateValue(key);
            if (!id) { id = newAssistantDraftId(); await writePrivateValue(key, id); }
            if (!/^[0-9a-f-]{36}$/i.test(id) || await readPrivateValue(key) !== id) throw new Error('تعذر حفظ معرّف طلبك بأمان؛ لم يُرسل طلب جديد.');
            if (current.current !== owner) return;
            const result = await request<PrivacyRequest>('/mobile/privacy-requests', { method: 'POST', body: JSON.stringify({ id, confirmed: true }) }, false, { noRetry: true });
            if (!result.id || !statuses[result.status]) throw new Error('نتيجة الطلب غير مؤكدة؛ حدّث الحالة قبل إعادة المحاولة.');
            if (current.current !== owner) return;
            setRequests(old => [result, ...old.filter(r => r.id !== result.id)]);
            setNotice('سُجّل طلبك لدى مدير المنصة. لم يُحذف الحساب أو أي فاتورة؛ تابع حالة الطلب والرد هنا.');
            try { if (await readPrivateValue(key) === id) await removePrivateValue(key); } catch { /* confirmed server receipt; keep same id for a safe retry */ }
        } catch (e) { if (current.current === owner) setError(e instanceof Error ? e.message : 'تعذر تأكيد تسجيل الطلب؛ أعد المحاولة دون مسح بيانات التطبيق.'); }
        finally { lock.current = false; if (current.current === owner) setBusy(false); }
    }
    const openRequest = requests.some(r => ['REQUESTED', 'IN_REVIEW'].includes(r.status));
    return <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {error ? <InfoNote tone="danger" text={error} /> : null}
        {notice ? <InfoNote text={notice} /> : null}
        <Surface padded={false}>
            <ListRow icon="document-text-outline" title="سياسة الخصوصية" divider onPress={() => void Linking.openURL('https://www.faramace.com/privacy')} />
            <ListRow icon="reader-outline" title="شروط الاستخدام" onPress={() => void Linking.openURL('https://www.faramace.com/terms')} />
        </Surface>
        <View><SectionTitle title="مشاركة البيانات مع الذكاء الاصطناعي" />
            <InfoNote text="الموافقة تخص حسابك على هذا الجهاز والجهة المحددة. رفض المشاركة لا يمنع استخدام بقية النظام. قراءة الوصفة تساعد الصيدلي ولا تصدر وصفة أو قراراً علاجياً." />
            {(['prescription', 'assistant'] as AIScope[]).map(scope => <Surface key={scope} style={{ gap: 10, marginTop: 12 }}>
                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right' }}>{scope === 'prescription' ? 'قراءة الوصفات' : 'المساعد النصي'}</Text>
                <Text style={{ color: C.mutedForeground, textAlign: 'right' }}>{consents[scope] ? `${consents[scope]!.recipient} · ${consents[scope]!.granted ? 'المشاركة مسموحة' : 'لا توجد موافقة حالية'}` : 'تعذر التحقق من الخدمة أو أنها غير مفعّلة'}</Text>
                <AppButton label="سحب الموافقة" variant="outline" disabled={busy} onPress={() => void revoke(scope)} />
            </Surface>)}
        </View>
        <View><SectionTitle title="طلب حذف الحساب والبيانات الشخصية" />
            <Surface style={{ gap: 12 }}>
                <Text style={{ color: C.mutedForeground, textAlign: 'right', lineHeight: 24 }}>اطلب حذف حسابك وبياناتك الشخصية. يتحقق مدير المنصة من هويتك وصلاحيتك ويبيّن نطاق الحذف وما يلزم الاحتفاظ به قانونياً أو محاسبياً والمدة المتوقعة في رده. لا يعني الطلب حذف بيانات المؤسسة أو فواتيرها أو مخزونها، ولا يعني تسجيله أن الحذف اكتمل.</Text>
                <AppButton label={openRequest ? 'لديك طلب قيد المعالجة' : 'تقديم طلب حذف حسابي وبياناتي'} variant="outline" disabled={busy || openRequest} onPress={() => Alert.alert('تقديم طلب حذف؟', 'سيُسجّل طلب باسم حسابك للتحقق والمعالجة. لن يُحذف شيء فوراً، ولا ترسل أي بيانات مرضى في طلبك.', [{ text: 'إلغاء', style: 'cancel' }, { text: 'تأكيد تقديم الطلب', onPress: () => void submitRequest() }])} />
            </Surface>
            {requests.map(r => <Surface key={r.id} style={{ marginTop: 12, gap: 8 }}>
                <Text selectable style={{ color: C.foreground, textAlign: 'right' }}>{statuses[r.status] ?? r.status}</Text>
                <Text selectable style={{ color: C.mutedForeground, fontSize: 12 }}>رقم الطلب: {r.id}</Text>
                <Text style={{ color: C.mutedForeground, textAlign: 'right' }}>{new Date(r.createdAt).toLocaleDateString('ar-IQ')}</Text>
                {r.response ? <Text style={{ color: C.foreground, textAlign: 'right', lineHeight: 24 }}>{r.response}</Text> : null}
            </Surface>)}
        </View>
        <AppButton label="تحديث الحالة" variant="outline" disabled={busy} onPress={() => { setError(''); void load().catch(() => setError('تعذر تحديث الحالة؛ حاول مجدداً.')); }} />
    </ScrollView>;
}
