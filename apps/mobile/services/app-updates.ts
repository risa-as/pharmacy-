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

export interface AutomaticUpdateOptions {
    canReload?: () => boolean;
    beforeReload?: () => Promise<void>;
    interactionVersion?: () => number;
}

/** Download during use; apply only on a real background → foreground return,
 * on a safe screen, without interrupting input or an unfinished invoice. */
export function startAutomaticUpdates(options: AutomaticUpdateOptions = {}): () => void {
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
    let wasBackgrounded = AppState.currentState === 'background';
    let resumeTicket = 0;
    let reloading = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    const applyOnResume = async (ticket: number, interaction: number) => {
        const eligible = () => !stopped && !reloading && ticket === resumeTicket &&
            AppState.currentState === 'active' && (options.canReload?.() ?? false) &&
            interaction === (options.interactionVersion?.() ?? 0);
        try {
            if (!eligible()) return;
            if (!downloaded && !Updates.latestContext?.isUpdatePending) {
                downloaded = await checkAndDownloadAppUpdate(() => !stopped) === 'ready';
            }
            if ((!downloaded && !Updates.latestContext?.isUpdatePending) || !eligible()) return;
            await options.beforeReload?.();
            // Re-check after storage/network waits: the user may have begun work.
            if (!eligible()) return;
            reloading = true;
            console.info('[Faramace updates] Applying downloaded update on safe resume');
            await Updates.reloadAsync();
        } catch {
            reloading = false; // Keep using the current app; retry on a later return.
        }
    };

    const check = async () => {
        if (stopped || inFlight || downloaded || AppState.currentState !== 'active') return;
        if (Updates.latestContext?.isUpdatePending) { downloaded = true; return; }
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
        if (state === 'background') {
            wasBackgrounded = true;
            resumeTicket++;
            clearTimeout(resumeTimer);
        } else if (state === 'active' && wasBackgrounded) {
            wasBackgrounded = false;
            const ticket = ++resumeTicket;
            const interaction = options.interactionVersion?.() ?? 0;
            // Let route/auth/checkout refs settle before considering a reload.
            resumeTimer = setTimeout(() => { void applyOnResume(ticket, interaction); void check(); }, 350);
        } else if (state === 'active') void check();
    });
    return () => {
        stopped = true;
        resumeTicket++;
        clearTimeout(resumeTimer);
        clearTimeout(startupTimer);
        clearInterval(interval);
        subscription.remove();
    };
}
