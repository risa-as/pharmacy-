import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;

/** Download quietly; Expo applies the cached update on the next cold launch.
 * Never reload a running POS session: carts and unsaved forms must survive.
 */
export function startAutomaticUpdates(): () => void {
    if (__DEV__ || !Updates.isEnabled) return () => {};

    let stopped = false;
    let inFlight = false;
    let downloaded = false;
    let lastAttempt = 0;

    const check = async () => {
        if (stopped || inFlight || downloaded || AppState.currentState !== 'active') return;
        const now = Date.now();
        if (lastAttempt && now - lastAttempt < CHECK_INTERVAL_MS) return;
        lastAttempt = now;
        inFlight = true;
        try {
            const result = await Updates.checkForUpdateAsync();
            if (!stopped && (result.isAvailable || result.isRollBackToEmbedded)) {
                const fetched = await Updates.fetchUpdateAsync();
                downloaded = fetched.isNew || fetched.isRollBackToEmbedded;
            }
        } catch {
            // Offline / update service unavailable: keep the installed app usable.
        } finally {
            inFlight = false;
        }
    };

    const startupTimer = setTimeout(() => { void check(); }, STARTUP_DELAY_MS);
    const interval = setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') void check();
    });
    return () => {
        stopped = true;
        clearTimeout(startupTimer);
        clearInterval(interval);
        subscription.remove();
    };
}
