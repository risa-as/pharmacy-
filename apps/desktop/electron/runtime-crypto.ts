import { webcrypto } from 'node:crypto';

// Electron's embedded Node may not expose Web Crypto globally. jose uses it
// for real signature verification; use Node's implementation when absent.
export function ensureWebCrypto() {
    if (typeof globalThis.crypto === 'undefined') {
        Object.defineProperty(globalThis, 'crypto', {
            value: webcrypto, configurable: true, writable: true,
        });
    }
}

ensureWebCrypto();
