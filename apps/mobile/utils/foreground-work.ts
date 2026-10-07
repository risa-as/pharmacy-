/** Let screen reads start and settle before a bulk background download. */
export class ForegroundWork {
    private active = new Set<symbol>();
    private changedAt = 0;
    begin() {
        const key = Symbol();
        this.active.add(key);
        this.changedAt = Date.now();
        return () => { if (this.active.delete(key)) this.changedAt = Date.now(); };
    }
    async waitForIdle(quietMs = 300, maxWaitMs = 8000) {
        const started = Date.now();
        const deadline = started + maxWaitMs;
        while (Date.now() < deadline) {
            const quietSince = Math.max(started, this.changedAt);
            if (this.active.size === 0 && Date.now() - quietSince >= quietMs) return;
            await new Promise<void>(resolve => setTimeout(resolve, Math.min(50, deadline - Date.now())));
        }
    }
}
export const foregroundReads = new ForegroundWork();
