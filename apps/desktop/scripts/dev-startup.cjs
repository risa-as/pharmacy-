/** Both Electron build entries share this controller. Renderer HMR stays active. */
function createDevStartup(autoRestart = false, log = console.info) {
    let started = false;
    let notified = false;
    let pending = Promise.resolve();
    return ({ startup }) => {
        pending = pending.catch(() => {}).then(async () => {
            if (started && !autoRestart) {
                if (!notified) {
                    log('[Desktop] Main/preload rebuilt. Restart pnpm dev to apply; the current window stays open. Use pnpm dev:watch for automatic restarts.');
                    notified = true;
                }
                return;
            }
            await startup();
            started = true;
        });
        // The plugin does not await onstart, so explicitly handle launch failures.
        return pending.catch(error => log(`[Desktop] Could not start Electron: ${String(error)}`));
    };
}

module.exports = { createDevStartup };
