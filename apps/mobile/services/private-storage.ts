import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Serialize migration, writes and deletion of the same key. A failed secure
// operation must never create or recover a native session from plaintext.
const pending = new Map<string, Promise<unknown>>();
function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const next = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    pending.set(key, next);
    void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => {});
    return next;
}
export function readPrivateValue(key: string): Promise<string | null> {
    return serial(key, async () => {
        if (Platform.OS === 'web') return AsyncStorage.getItem(key);
        const current = await SecureStore.getItemAsync(key); // throws: fail closed
        if (current != null) return current;
        if (!['authToken', 'user'].includes(key)) return null;
        const legacy = await AsyncStorage.getItem(key);
        if (legacy == null) return null;
        await SecureStore.setItemAsync(key, legacy);
        if (await SecureStore.getItemAsync(key) !== legacy) throw new Error('تعذر تأمين الجلسة القديمة؛ لم تُحذف بياناتها.');
        await AsyncStorage.removeItem(key);
        return legacy;
    });
}
export function writePrivateValue(key: string, value: string): Promise<void> {
    return serial(key, async () => {
        if (Platform.OS === 'web') { await AsyncStorage.setItem(key, value); return; }
        await SecureStore.setItemAsync(key, value);
        if (await SecureStore.getItemAsync(key) !== value) throw new Error('تعذر حفظ البيانات بأمان؛ أعد المحاولة دون مسح بيانات التطبيق.');
        if (['authToken', 'user'].includes(key)) await AsyncStorage.removeItem(key);
    });
}
export function removePrivateValue(key: string): Promise<void> {
    return serial(key, async () => {
        if (Platform.OS !== 'web') {
            await SecureStore.deleteItemAsync(key);
            if (await SecureStore.getItemAsync(key) != null) throw new Error('تعذر إكمال إزالة البيانات الآمنة؛ حاول مجدداً.');
        }
        await AsyncStorage.removeItem(key);
    });
}
