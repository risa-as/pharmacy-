import { beforeEach, describe, expect, it } from 'vitest';
import { cacheKey, readCache, writeCache, clearPageCache, revalidate, cacheSize } from '../page-cache';

beforeEach(() => clearPageCache());

describe('desktop page cache', () => {
    it('keys never cross users, branches, pages or parameters', () => {
        const keys = [
            cacheKey('u1', 'b1', 'dashboard'), cacheKey('u2', 'b1', 'dashboard'), cacheKey('u1', 'b2', 'dashboard'),
            cacheKey('u1', 'b1', 'pos'), cacheKey('u1', 'b1', 'pos', { q: 'x' }),
        ];
        expect(new Set(keys).size).toBe(keys.length);
        writeCache(keys[0], { total: 5 });
        expect(readCache(keys[0])?.value).toEqual({ total: 5 });
        expect(readCache(keys[1])).toBeUndefined();
    });

    it('logout clears everything', () => {
        writeCache(cacheKey('u1', 'b1', 'pos'), [1, 2]);
        clearPageCache();
        expect(cacheSize()).toBe(0);
    });

    it('a refresh is applied only to the key still on screen', async () => {
        const k1 = cacheKey('u1', 'b1', 'pos', { q: 'a' }), k2 = cacheKey('u1', 'b1', 'pos', { q: 'b' });
        let shown = k2; const applied: unknown[] = [];
        expect(await revalidate(k1, async () => 'A', k => k === shown, v => applied.push(v))).toBe('stale');
        expect(applied).toEqual([]);
        expect(readCache(k1)?.value).toBe('A'); // kept for the next visit of that key
        expect(await revalidate(k2, async () => 'B', k => k === shown, v => applied.push(v))).toBe('applied');
        expect(applied).toEqual(['B']);
    });

    it('a refresh that finishes after a logout is dropped, not stored', async () => {
        const k = cacheKey('u1', 'b1', 'dashboard');
        let release!: (v: string) => void;
        const pending = revalidate(k, () => new Promise<string>(r => { release = r; }), () => true, () => { throw new Error('must not apply'); });
        clearPageCache();
        release('old user data');
        expect(await pending).toBe('stale');
        expect(readCache(k)).toBeUndefined();
    });

    it('an older answer for the same key never replaces a newer one', async () => {
        const k = cacheKey('u1', 'b1', 'dashboard');
        let releaseOld!: (v: string) => void, releaseNew!: (v: string) => void;
        let shown: string | undefined;
        const first = revalidate(k, () => new Promise<string>(r => { releaseOld = r; }), () => true, v => { shown = v; });
        const second = revalidate(k, () => new Promise<string>(r => { releaseNew = r; }), () => true, v => { shown = v; });
        releaseNew('new');
        expect(await second).toBe('applied');
        releaseOld('old');
        expect(await first).toBe('stale');
        expect(shown).toBe('new');
        expect(readCache(k)?.value).toBe('new');
    });

    it('an older request failing after a newer one succeeded is not reported as a failure', async () => {
        const k = cacheKey('u1', 'b1', 'dashboard');
        let failOld!: (e: Error) => void, releaseNew!: (v: string) => void;
        const first = revalidate(k, () => new Promise<string>((_, rej) => { failOld = rej; }), () => true, () => {});
        const second = revalidate(k, () => new Promise<string>(r => { releaseNew = r; }), () => true, () => {});
        releaseNew('new');
        expect(await second).toBe('applied');
        failOld(new Error('late failure'));
        expect(await first).toBe('stale');
        expect(readCache(k)?.value).toBe('new');
    });

    it('a failed refresh keeps the cached value', async () => {
        const k = cacheKey('u1', 'b1', 'dashboard');
        writeCache(k, 'cached');
        expect(await revalidate(k, async () => { throw new Error('ipc'); }, () => true, () => {})).toBe('failed');
        expect(readCache(k)?.value).toBe('cached');
    });
});
