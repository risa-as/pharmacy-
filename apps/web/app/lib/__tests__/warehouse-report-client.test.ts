import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReportRequestCache, reportDayRange } from '../warehouse-report-client';
afterEach(() => vi.useRealTimers());
describe('page-scoped report requests', () => {
 it('coalesces concurrent requests and reuses readable bodies for repeated tabs', async () => {
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({total:120}))); const cache=createReportRequestCache(60000,fetcher);
  const [a,b]=await Promise.all([cache.fetch('/sales?days=30'),cache.fetch('/sales?days=30')]);
  expect(await a.json()).toEqual({total:120}); expect(await b.json()).toEqual({total:120});
  expect(await (await cache.fetch('/sales?days=30')).json()).toEqual({total:120}); expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('separates filters and page instances and expires after a minute', async () => {
  vi.useFakeTimers();const fetcher=vi.fn(async()=>new Response('{}'));const cache=createReportRequestCache(60000,fetcher);
  await cache.fetch('/sales?days=30');await cache.fetch('/sales?days=90');
  await createReportRequestCache(60000,fetcher).fetch('/sales?days=30');
  vi.advanceTimersByTime(60001);await cache.fetch('/sales?days=30');expect(fetcher).toHaveBeenCalledTimes(4);
 });
 it('does not cache failures and manual refresh discards successful results', async () => {
  const fetcher=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(new Response('{}',{status:403})).mockImplementation(async()=>new Response('{}'));
  const cache=createReportRequestCache(60000,fetcher);
  await expect(cache.fetch('/sales')).rejects.toThrow('offline');expect((await cache.fetch('/sales')).status).toBe(403);
  await cache.fetch('/sales');cache.clear();await cache.fetch('/sales');expect(fetcher).toHaveBeenCalledTimes(4);
 });
 it('a completion from before refresh cannot replace a newer request', async () => {
  let resolve!: (r:Response)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;})).mockImplementation(async()=>new Response('{"version":2}'));
  const cache=createReportRequestCache(60000,fetcher);const old=cache.fetch('/sales');cache.clear();await cache.fetch('/sales');resolve(new Response('{"version":1}'));await old;
  expect(await (await cache.fetch('/sales')).json()).toEqual({version:2});expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('uses stable inclusive Baghdad day boundaries rather than changing milliseconds',()=>{
  const now=Date.parse('2026-09-21T22:10:00Z');expect(reportDayRange(7,now)).toEqual({from:'2026-09-16',to:'2026-09-22'});expect(reportDayRange(7,now+1000)).toEqual(reportDayRange(7,now));
 });
});
