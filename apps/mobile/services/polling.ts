import { AppState, AppStateStatus } from 'react-native';

interface PollingJob {
    fetchFn: () => Promise<void>;
    intervalMs: number;
    timer: ReturnType<typeof setInterval> | null;
}

const jobs: Record<string, PollingJob> = {};
let currentAppState: AppStateStatus = 'active';

// Pause all timers when app goes to background; restart when it returns
AppState.addEventListener('change', (nextState: AppStateStatus) => {
    const wasActive = currentAppState === 'active';
    const isNowActive = nextState === 'active';
    currentAppState = nextState;

    if (wasActive && !isNowActive) {
        // Going to background — clear all timers to save battery
        Object.values(jobs).forEach(job => {
            if (job.timer) {
                clearInterval(job.timer);
                job.timer = null;
            }
        });
    } else if (!wasActive && isNowActive) {
        // Returning to foreground — restart timers and fetch immediately
        Object.values(jobs).forEach(job => {
            void job.fetchFn(); // immediate refresh
            job.timer = setInterval(job.fetchFn, job.intervalMs);
        });
    }
});

export const pollingService = {
    /**
     * Register a polling job. Starts immediately if the app is active.
     * Replaces any existing job with the same key.
     */
    register(key: string, fetchFn: () => Promise<void>, intervalMs: number) {
        this.unregister(key); // clear any existing job

        const job: PollingJob = { fetchFn, intervalMs, timer: null };
        jobs[key] = job;

        if (currentAppState === 'active') {
            void fetchFn(); // run immediately on registration
            job.timer = setInterval(fetchFn, intervalMs);
        }
    },

    /** Stop polling for a key and remove it. */
    unregister(key: string) {
        const job = jobs[key];
        if (job?.timer) clearInterval(job.timer);
        delete jobs[key];
    },

    /** Immediately trigger a fetch for the given key without waiting for the next interval. */
    trigger(key: string) {
        const job = jobs[key];
        if (job) void job.fetchFn();
    },

    /** Stop all registered polling jobs. */
    unregisterAll() {
        Object.keys(jobs).forEach(key => this.unregister(key));
    },
};
