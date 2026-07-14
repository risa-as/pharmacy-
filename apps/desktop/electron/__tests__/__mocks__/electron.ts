// Minimal `electron` stub for unit tests. The modules under test only reference
// `app` at import time (e.g. app.getPath inside helpers that the pure functions
// never call), so a no-op app is enough to let the module load in node.
export const app = {
    getPath: (_name?: string) => '',
    isPackaged: false,
};

export const BrowserWindow = { getAllWindows: () => [] };
