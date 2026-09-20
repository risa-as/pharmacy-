import { AppState, AppStateStatus } from 'react-native';

interface PollingJob {
    fetchFn: () => Promise<void>;
    intervalMs: number;
    timer: ReturnType<typeof setInterval> | null;
    running: boolean;
    pending: boolean;
}

const jobs: Record<string, PollingJob> = {};
let currentAppState: AppStateStatus = 'active';

function runJob(key: string, job: PollingJob, queueIfRunning = false) {
    if (job.running) {
        if (queueIfRunning && currentAppState === 'active') {
            job.pending = true;
        }
        return;
    }

    job.running = true;
    void Promise.resolve()
        .then(job.fetchFn)
        .catch(error => {
            console.error(`Polling job "${key}" failed:`, error);
        })
        .finally(() => {
            job.running = false;
            if (jobs[key] !== job) {
                job.pending = false;
                return;
            }
            if (job.pending && currentAppState === 'active') {
                job.pending = false;
                runJob(key, job, true);
            } else {
                job.pending = false;
            }
        });
}

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
        Object.entries(jobs).forEach(([key, job]) => {
            runJob(key, job, true); // immediate refresh
            if (!job.timer) {
                job.timer = setInterval(() => runJob(key, job), job.intervalMs);
            }
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

        const job: PollingJob = { fetchFn, intervalMs, timer: null, running: false, pending: false };
        jobs[key] = job;

        if (currentAppState === 'active') {
            runJob(key, job, true); // run immediately on registration
            job.timer = setInterval(() => runJob(key, job), intervalMs);
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
        if (job) runJob(key, job, true);
    },

    /** Stop all registered polling jobs. */
    unregisterAll() {
        Object.keys(jobs).forEach(key => this.unregister(key));
    },
};
