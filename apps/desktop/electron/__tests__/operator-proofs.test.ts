import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('../store', () => ({ default: { get: (k: string) => h.data[k], set: (k: string, v: unknown) => { h.data[k] = v; } } }));
import { operatorProofsFor, saveOperatorProof } from '../operator-proofs';

beforeEach(() => { h.data = {}; });

it('keeps one proof per employee and attaches only the proofs of the operators in a batch', () => {
    saveOperatorProof('u1', '1.aaa');
    saveOperatorProof('u2', '1.bbb');
    saveOperatorProof('u1', '2.ccc');
    expect(operatorProofsFor(['u1', null, 'u3', undefined])).toEqual({ u1: '2.ccc' });
    expect(operatorProofsFor(['u2', 'u1'])).toEqual({ u2: '1.bbb', u1: '2.ccc' });
});

it('ignores an empty or missing proof (older servers send none)', () => {
    saveOperatorProof('u1', undefined);
    saveOperatorProof('', 'x');
    expect(operatorProofsFor(['u1'])).toEqual({});
});
