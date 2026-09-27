import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

// Runs the real refreshOfflineToken from sync.ts with its collaborators replaced.
const source = readFileSync(new URL('../sync.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function refreshOfflineToken()');
const code = ts.transpileModule(source.slice(start, source.indexOf('\n}', start) + 2).replace('export ', ''),
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function run(responses: Response[], saved: Record<string, unknown> = {}) {
    const fetch = vi.fn(async () => responses.shift()!);
    const stored = vi.fn();
    const data: Record<string, unknown> = { licenseKey: 'LICENSE-SECRET', ...saved };
    const store = { get: (k: string) => data[k], set: (k: string, v: unknown) => { data[k] = v; } };
    const refresh = new Function('getBranchId', 'store', 'buildApiUrl', 'fetch', 'storeOfflineToken', 'console',
        code + ';return refreshOfflineToken;')(() => 'branch-1', store, (p: string) => 'https://app.test/api' + p, fetch, stored,
        { log: vi.fn(), warn: vi.fn() });
    return { refresh, fetch, stored, data };
}
const marked = { 'x-license-transport': 'header' };
const ok = (headers: Record<string, string> = marked) => new Response(JSON.stringify({ token: 'jwt' }), { status: 200, headers });
const oldServer400 = () => new Response(JSON.stringify({ error: 'branchId and licenseKey are required' }), { status: 400 });
const urls = (h: ReturnType<typeof run>) => h.fetch.mock.calls.map(call => (call as unknown as [string])[0]);

it('sends the license in a header, never in the URL, and remembers that the server reads it', async () => {
    const h = run([ok()]);
    await h.refresh();
    expect(urls(h)).toEqual(['https://app.test/api/sync/offline-token?branchId=branch-1']);
    expect((h.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ 'x-device-license-key': 'LICENSE-SECRET' });
    expect(h.data.offlineTokenLicenseHeader).toBe(true);
    expect(h.stored).toHaveBeenCalledWith('jwt');
});

it('uses the URL form only for a server from before the header (its exact 400, no marker)', async () => {
    const h = run([oldServer400(), ok({})]);
    await h.refresh();
    expect(urls(h)[1]).toContain('licenseKey=LICENSE-SECRET');
    expect(h.stored).toHaveBeenCalledWith('jwt');
});

it('never falls back once a server confirmed the header, even on the old message', async () => {
    const h = run([oldServer400()], { offlineTokenLicenseHeader: true });
    await h.refresh();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(urls(h).join()).not.toContain('LICENSE-SECRET');
});

it('does not fall back on any other 400, or on a marked 400', async () => {
    for (const response of [
        new Response(JSON.stringify({ error: 'bad request' }), { status: 400 }),
        new Response(JSON.stringify({ error: 'branchId and licenseKey are required' }), { status: 400, headers: marked }),
    ]) {
        const h = run([response]);
        await h.refresh();
        expect(h.fetch).toHaveBeenCalledOnce();
        expect(urls(h).join()).not.toContain('LICENSE-SECRET');
    }
});

it('does not retry a refused license', async () => {
    const h = run([new Response('{}', { status: 403, headers: marked })]);
    await h.refresh();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.stored).not.toHaveBeenCalled();
    expect(h.data.lastSeenAt).toBeUndefined();
});
