import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStorage, removeStorage, storageKeys, tryReadStorage, writeStorage } from '../../../../../packages/shared/src/safe-storage';

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
};
const throwing = () => {
  const fail = () => { throw new DOMException('blocked', 'SecurityError'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
};

afterEach(() => vi.unstubAllGlobals());

describe.each(['local', 'session'] as const)('%sStorage', (kind) => {
  const name = kind === 'local' ? 'localStorage' : 'sessionStorage';

  it('reads, writes and removes when available', () => {
    vi.stubGlobal(name, memory());
    expect(readStorage(kind, 'k')).toBeNull();
    expect(writeStorage(kind, 'k', 'v')).toBe(true);
    expect(readStorage(kind, 'k')).toBe('v');
    expect(removeStorage(kind, 'k')).toBe(true);
    expect(readStorage(kind, 'k')).toBeNull();
  });

  it('never throws when every call throws', () => {
    vi.stubGlobal(name, throwing());
    expect(readStorage(kind, 'k')).toBeNull();
    expect(writeStorage(kind, 'k', 'v')).toBe(false);
    expect(removeStorage(kind, 'k')).toBe(false);
  });

  it('never throws when reaching the storage object throws', () => {
    Object.defineProperty(globalThis, name, { configurable: true, get: () => { throw new DOMException('denied', 'SecurityError'); } });
    try {
      expect(readStorage(kind, 'k')).toBeNull();
      expect(writeStorage(kind, 'k', 'v')).toBe(false);
      expect(removeStorage(kind, 'k')).toBe(false);
    } finally {
      delete (globalThis as Record<string, unknown>)[name];
    }
  });

  it('treats missing storage (server render) as empty', () => {
    vi.stubGlobal(name, undefined);
    expect(readStorage(kind, 'k')).toBeNull();
    expect(writeStorage(kind, 'k', 'v')).toBe(false);
    expect(removeStorage(kind, 'k')).toBe(true);
  });
});

describe('writeStorage confirms by reading back', () => {
  it('reports failure when setItem silently stores nothing', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    expect(writeStorage('local', 'k', 'v')).toBe(false);
  });
  it('reports failure when a different value is read back', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'old', setItem: () => undefined, removeItem: () => undefined });
    expect(writeStorage('local', 'k', 'v')).toBe(false);
  });
});

describe('storageKeys', () => {
  it('lists keys, and returns null (not an empty list) when listing fails or storage is missing', () => {
    const map = new Map([['a', '1'], ['b', '2']]);
    vi.stubGlobal('localStorage', { key: (i: number) => [...map.keys()][i] ?? null, get length() { return map.size; } });
    expect(storageKeys('local')).toEqual(['a', 'b']);
    vi.stubGlobal('localStorage', { key: () => { throw new DOMException('blocked', 'SecurityError'); }, length: 1 });
    expect(storageKeys('local')).toBeNull();
    vi.stubGlobal('localStorage', undefined);
    expect(storageKeys('local')).toBeNull();
  });
});

describe('tryReadStorage', () => {
  it('null for a missing entry, undefined when the read fails or storage is missing', () => {
    vi.stubGlobal('localStorage', memory());
    expect(tryReadStorage('local', 'k')).toBeNull();
    vi.stubGlobal('localStorage', throwing());
    expect(tryReadStorage('local', 'k')).toBeUndefined();
    vi.stubGlobal('localStorage', undefined);
    expect(tryReadStorage('local', 'k')).toBeUndefined();
  });
});
