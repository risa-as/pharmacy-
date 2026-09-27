/**
 * localStorage / sessionStorage that never throws.
 *
 * The storage objects can be missing (server render, tests), and both reaching
 * them and every call on them can throw (blocked site data, private windows,
 * full quota). Callers get null / false instead and keep the UI working.
 */
export type StorageKind = 'local' | 'session';

function area(kind: StorageKind): Storage | undefined {
  const scope = globalThis as { localStorage?: Storage; sessionStorage?: Storage };
  return kind === 'local' ? scope.localStorage : scope.sessionStorage;
}

/** The stored value, or null when absent, unavailable or failing. */
export function readStorage(kind: StorageKind, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** True only when the value was stored. */
export function writeStorage(kind: StorageKind, key: string, value: string): boolean {
  try {
    const storage = area(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** True when the key is gone (or storage is unavailable, so nothing is kept). */
export function removeStorage(kind: StorageKind, key: string): boolean {
  try {
    area(kind)?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
