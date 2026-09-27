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

/**
 * Like readStorage, but tells a failed read (undefined) apart from a missing
 * entry (null). Callers deciding whether a record exists need the difference.
 */
export function tryReadStorage(kind: StorageKind, key: string): string | null | undefined {
  try {
    const storage = area(kind);
    if (!storage) return undefined;
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

/**
 * True only when the value was stored: it is read back and compared, since some
 * environments accept setItem and keep nothing. Callers that must not continue
 * without a durable record (such as an idempotency key) rely on this.
 */
export function writeStorage(kind: StorageKind, key: string, value: string): boolean {
  try {
    const storage = area(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return storage.getItem(key) === value;
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

/**
 * All keys, or null when they cannot be listed. Callers that look for a pending
 * record must treat null as "unknown", never as "none".
 */
export function storageKeys(kind: StorageKind): string[] | null {
  try {
    const storage = area(kind);
    if (!storage) return null;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return null;
  }
}
