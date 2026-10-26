import { Alert, Linking } from 'react-native';
import { request, getSessionGeneration } from './api';
import { readPrivateValue, writePrivateValue, removePrivateValue } from './private-storage';
import { createAIConsentService, type AIDisclosure, type AIScope } from '../utils/ai-consent';

export const aiConsent = createAIConsentService({
    generation: getSessionGeneration,
    owner: async () => { const raw = await readPrivateValue('user'); return raw ? JSON.parse(raw).id ?? '' : ''; },
    disclosure: scope => request<AIDisclosure>(`/mobile/ai-disclosure?scope=${scope}`, { cache: 'no-store' }, false, { noRetry: true, forceRefresh: true }),
    read: readPrivateValue, write: writePrivateValue, remove: removePrivateValue,
});
export const requireAIConsent = (scope: AIScope) => aiConsent.require(scope);
export function authorizeAISharing(scope: AIScope) {
    return aiConsent.authorize(scope, d => new Promise<boolean>(resolve => {
        Alert.alert('مشاركة البيانات مع ' + d.recipient,
            `${d.data}\n\nالغرض: ${d.purpose}\n\nالمشاركة اختيارية. يمكنك سحب الموافقة من الإعدادات ← الخصوصية. لا تشارك بيانات مريض دون صلاحية وموافقة مناسبة.`,
            [
                { text: 'لا أوافق', style: 'cancel', onPress: () => resolve(false) },
                { text: 'الخصوصية والتفاصيل', onPress: () => { void Linking.openURL(d.privacyUrl).catch(() => {}); resolve(false); } },
                { text: 'أوافق على المشاركة', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) });
    }));
}
