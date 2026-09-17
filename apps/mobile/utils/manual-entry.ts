/**
 * Scanner → search-field hand-off.
 *
 * "إدخال يدوي" in the scanner returns to the screen that opened it and its
 * search field should be ready to type in. router.back() carries no params, so
 * the scanner leaves a short-lived note here and the source screen picks it up
 * when it regains focus.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pendingManualEntry';
/** A note older than this is stale (the user went somewhere else); ignore it. */
const MAX_AGE_MS = 15_000;

export type ManualEntryScreen = 'sales' | 'inventory';

/** Called by the scanner just before going back. */
export async function requestManualEntry(screen: ManualEntryScreen): Promise<void> {
    try {
        await AsyncStorage.setItem(KEY, `${screen}:${Date.now()}`);
    } catch { /* the field simply won't auto-focus */ }
}

/**
 * Consumes the note if it belongs to `screen` and is still fresh.
 * A note left for another screen is kept so that screen can take it.
 */
export async function consumeManualEntry(screen: ManualEntryScreen): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!raw) return false;
        const [target, at] = raw.split(':');
        if (target !== screen) return false;
        await AsyncStorage.removeItem(KEY);
        return Date.now() - Number(at) < MAX_AGE_MS;
    } catch {
        return false;
    }
}
