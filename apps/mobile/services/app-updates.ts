import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

export type AppUpdateResult = 'ready' | 'current' | 'cancelled' | 'unsupported';
let activeCheck: Promise<AppUpdateResult> | undefined;

/** Share a single check/download between the About screen and background checks. */
export function checkAndDownloadAppUpdate(shouldContinue = () => true): Promise<AppUpdateResult> {
    if (__DEV__ || !Updates.isEnabled) return Promise.resolve('unsupported');
    if (activeCheck) return activeCheck;
    activeCheck = (async (): Promise<AppUpdateResult> => {
        const result = await Updates.checkForUpdateAsync();
        if (!shouldContinue()) return 'cancelled';
        if (!result.isAvailable && !result.isRollBackToEmbedded) return 'current';
        const fetched = await Updates.fetchUpdateAsync();
        return fetched.isNew || fetched.isRollBackToEmbedded ? 'ready' : 'current';
    })().finally(() => { activeCheck = undefined; });
    return activeCheck;
}

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;

/** Download quietly; Expo applies the cached update on the next cold launch.
 * Never reload a running POS session: carts and unsaved forms must survive.
 */
export function startAutomaticUpdates(): () => void {
    if (__DEV__ || !Updates.isEnabled) return () => {};

    // Release diagnostics contain no account or patient data. This identifies
    // the OTA actually running on a device, rather than just a published update.
    console.info('[Faramace updates]', JSON.stringify({
        runtimeVersion: Updates.runtimeVersion,
        updateId: Updates.updateId,
        isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        channel: Updates.channel,
    }));

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
            downloaded = await checkAndDownloadAppUpdate(() => !stopped) === 'ready';
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
