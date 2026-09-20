export type CoalescedRunOptions<T> = {
    onJoin?: () => void;
    onTimeout?: () => void;
    timeoutMs: number;
    timeoutResult: T;
};

export function createCoalescedRun<T>(
    runExclusive: () => Promise<T>,
    options: CoalescedRunOptions<T>,
): () => Promise<T> {
    let inFlight: Promise<T> | null = null;

    return async function runCoalesced(): Promise<T> {
        if (inFlight) {
            options.onJoin?.();
            return await waitForRun(inFlight, options);
        }

        const run = runExclusive();
        inFlight = run;
        try {
            return await run;
        } finally {
            if (inFlight === run) {
                inFlight = null;
            }
        }
    };
}

async function waitForRun<T>(
    run: Promise<T>,
    options: CoalescedRunOptions<T>,
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            run,
            new Promise<T>((resolve) => {
                timeoutId = setTimeout(() => {
                    options.onTimeout?.();
                    resolve(options.timeoutResult);
                }, options.timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}
