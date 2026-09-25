export function createDevStartup(
    autoRestart?: boolean,
    log?: (message: string) => void,
): (options: { startup: () => Promise<void> }) => Promise<void>;
