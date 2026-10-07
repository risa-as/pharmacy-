import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { finishTransferAttempt, pendingTransferBody, prepareTransferAttempt } from '../transfer-attempt';
let data: Map<string, string>;
const body = { fromBranchId: 'a', toBranchId: 'b', items: [{ batchId: 'one', quantity: 3 }] };
beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());
it('reopening resumes the exact body and key of the pending attempt', () => {
  const a = prepareTransferAttempt('u:a', body); expect(prepareTransferAttempt('u:a', body).key).toBe(a.key); expect(pendingTransferBody('u:a')).toEqual(body);
});
it('a changed body cannot discard an unresolved attempt', () => {
  const a = prepareTransferAttempt('u:a', body); expect(() => prepareTransferAttempt('u:a', { ...body, toBranchId: 'c' })).toThrow('غير محسومة'); expect(prepareTransferAttempt('u:a', body).key).toBe(a.key);
});
it('read failure, corrupt data, failed write and silent write each block sending', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); } }); expect(() => prepareTransferAttempt('x', body)).toThrow('لم يُرسل');
  vi.stubGlobal('localStorage', { getItem: () => '{broken' }); expect(() => prepareTransferAttempt('x', body)).toThrow('لم يُرسل');
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw Error('full'); } }); expect(() => prepareTransferAttempt('x', body)).toThrow('لم يُرسل');
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} }); expect(() => prepareTransferAttempt('x', body)).toThrow('لم يُرسل');
});
it('success retires only its own key and permits an explicit new transfer', () => {
  const a = prepareTransferAttempt('x', body); finishTransferAttempt('x', a.key); const b = prepareTransferAttempt('x', body); expect(b.key).not.toBe(a.key); finishTransferAttempt('x', a.key); expect(prepareTransferAttempt('x', body).key).toBe(b.key);
});
it('failed removal is durably marked settled and cannot be resumed as pending', () => {
  const a = prepareTransferAttempt('x', body); vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: () => { throw Error('blocked'); } });
  finishTransferAttempt('x', a.key); expect(pendingTransferBody('x')).toBeNull(); expect(prepareTransferAttempt('x', body).key).not.toBe(a.key);
});
it('scope separates employees and source branches', () => {
  const a = prepareTransferAttempt('u:a', body); expect(prepareTransferAttempt('v:a', body).key).not.toBe(a.key); expect(prepareTransferAttempt('u:b', body).key).not.toBe(a.key);
});
