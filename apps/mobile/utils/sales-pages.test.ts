import { describe, expect, it, vi } from 'vitest';
import { readSalesPages } from './sales-pages';
describe('complete sales period', () => {
    it('loads 76 rows in one request without discarding summary rows', async () => {
        const rows = Array.from({ length: 76 }, (_, id) => ({ id, total: id + 1 }));
        const fetch = vi.fn().mockResolvedValue(rows);
        const result = await readSalesPages<(typeof rows)[number]>(fetch, 0, false, new AbortController().signal);
        expect(result.rows).toEqual(rows);
        expect(result.rows.reduce((sum, row) => sum + row.total, 0)).toBe(2926);
        expect(fetch).toHaveBeenCalledExactlyOnceWith(0, 100);
        expect(result.hasMore).toBe(false);
    });
    it('keeps all rows and offsets across more than one page', async () => {
        const all = Array.from({ length: 245 }, (_, id) => id);
        const fetch = vi.fn(async (offset, limit) => all.slice(offset, offset + limit));
        expect((await readSalesPages(fetch, 0, false, new AbortController().signal)).rows).toEqual(all);
        expect(fetch.mock.calls).toEqual([[0, 100], [100, 100], [200, 100]]);
    });
    it('appends one page starting from the existing row count', async () => {
        const fetch = vi.fn().mockResolvedValue([151, 152]);
        expect(await readSalesPages(fetch, 150, true, new AbortController().signal)).toEqual({ rows: [151, 152], hasMore: false });
        expect(fetch).toHaveBeenCalledExactlyOnceWith(150, 100);
    });
    it('stops an obsolete read instead of requesting the next page', async () => {
        const controller = new AbortController();
        const fetch = vi.fn(async () => { controller.abort(); return Array.from({ length: 100 }, (_, id) => id); });
        await expect(readSalesPages(fetch, 0, false, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('retains the 5,000-row bound and offers another page', async () => {
        const fetch = vi.fn(async () => Array.from({ length: 100 }, (_, id) => id));
        const result = await readSalesPages(fetch, 0, false, new AbortController().signal);
        expect(result.rows).toHaveLength(5000);
        expect(result.hasMore).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(50);
    });
});
