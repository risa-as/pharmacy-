/** Bound a network operation, including reading its response body. */
export async function withNetworkDeadline<T>(run: (signal: AbortSignal) => Promise<T>, milliseconds = 8_000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), milliseconds);
    try { return await run(controller.signal); }
    finally { clearTimeout(timer); }
}
