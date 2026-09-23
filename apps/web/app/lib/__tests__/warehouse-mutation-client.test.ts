import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { warehouseMutation } from '../warehouse-mutation-client';
const store = new Map<string,string>();
beforeEach(() => {
    store.clear();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('sessionStorage', { getItem: (key:string) => store.get(key), setItem: (key:string,value:string) => store.set(key,value), removeItem:(key:string)=>store.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
describe('durable browser mutation identity',()=>{
    it('retains the key after a network failure and clears it after complete success',async()=>{
        const fetcher=vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch',fetcher);
        const init={method:'POST',body:JSON.stringify({amount:123})};
        await expect(warehouseMutation('/test/payment-a',init)).rejects.toThrow('connection lost');
        await warehouseMutation('/test/payment-a',init);
        const first=JSON.parse(fetcher.mock.calls[0][1].body).idempotencyKey;
        expect(JSON.parse(fetcher.mock.calls[1][1].body).idempotencyKey).toBe(first);
        fetcher.mockResolvedValue(new Response('{}'));
        await warehouseMutation('/test/payment-a',init);
        expect(JSON.parse(fetcher.mock.calls[2][1].body).idempotencyKey).not.toBe(first);
    });
    it('retains the key when success headers arrive but the response body is truncated',async()=>{
        const fetcher=vi.fn().mockResolvedValueOnce(new Response('{')).mockResolvedValueOnce(new Response('{}'));
        vi.stubGlobal('fetch',fetcher);
        const init={method:'POST',body:'{"amount":321}'};
        await expect(warehouseMutation('/test/payment-b',init)).rejects.toThrow();
        await warehouseMutation('/test/payment-b',init);
        expect(JSON.parse(fetcher.mock.calls[0][1].body).idempotencyKey).toBe(JSON.parse(fetcher.mock.calls[1][1].body).idempotencyKey);
    });
    it('uses distinct operation identities for changed amounts after an ambiguous failure',async()=>{
        const fetcher=vi.fn().mockRejectedValue(new Error('offline'));vi.stubGlobal('fetch',fetcher);
        await warehouseMutation('/test/payment-c',{body:'{"amount":1}'}).catch(()=>{});
        await warehouseMutation('/test/payment-c',{body:'{"amount":2}'}).catch(()=>{});
        expect(JSON.parse(fetcher.mock.calls[0][1].body).idempotencyKey).not.toBe(JSON.parse(fetcher.mock.calls[1][1].body).idempotencyKey);
    });
});
