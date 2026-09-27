import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

// Runs the real refreshOfflineToken from sync.ts with its collaborators replaced.
const source = readFileSync(new URL('../sync.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function refreshOfflineToken()');
const code = ts.transpileModule(source.slice(start, source.indexOf('\n}', start) + 2).replace('export ', ''),
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function run(responses: Response[]) {
    const fetch = vi.fn(async () => responses.shift()!);
    const saved = vi.fn();
    const data: Record<string, string> = { licenseKey: 'LICENSE-SECRET' };
    const store = { get: (k: string) => data[k], set: (k: string, v: string) => { data[k] = v; } };
    const refresh = new Function('getBranchId', 'store', 'buildApiUrl', 'fetch', 'storeOfflineToken', 'console',
        code + ';return refreshOfflineToken;')(() => 'branch-1', store, (p: string) => 'https://app.test/api' + p, fetch, saved,
        { log: vi.fn(), warn: vi.fn() });
    return { refresh, fetch, saved, data };
}
const ok = () => new Response(JSON.stringify({ token: 'jwt' }), { status: 200 });

it('sends the license in a header, never in the URL, to an updated server', async () => {
    const h = run([ok()]);
    await h.refresh();
    expect(h.fetch).toHaveBeenCalledOnce();
    const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.test/api/sync/offline-token?branchId=branch-1');
    expect(url).not.toContain('LICENSE-SECRET');
    expect(init.headers).toEqual({ 'x-device-license-key': 'LICENSE-SECRET' });
    expect(h.saved).toHaveBeenCalledWith('jwt');
});

it('asks once more the old way when the server predates the header (400)', async () => {
    const h = run([new Response('{}', { status: 400 }), ok()]);
    await h.refresh();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect((h.fetch.mock.calls[1] as unknown as [string])[0]).toContain('licenseKey=LICENSE-SECRET');
    expect(h.saved).toHaveBeenCalledWith('jwt');
});

it('does not retry a refused license', async () => {
    const h = run([new Response('{}', { status: 403 })]);
    await h.refresh();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.saved).not.toHaveBeenCalled();
    expect(h.data.lastSeenAt).toBeUndefined();
});
