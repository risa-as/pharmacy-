import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { checkClientSecrets } = require('../../scripts/check-client-secrets.cjs');

describe('desktop payment secret boundary', () => {
  it('rejects a distributed secret reference and accepts public verification material', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-secret-test-'));
    try {
      fs.mkdirSync(path.join(root, 'dist'));
      fs.mkdirSync(path.join(root, 'dist-electron'));
      const file = path.join(root, 'dist-electron', 'main.js');
      fs.writeFileSync(file, 'const ZAINCASH_SECRET = "test-canary";');
      expect(() => checkClientSecrets(root)).toThrow('Client secret reference');
      fs.writeFileSync(file, 'const OFFLINE_TOKEN_PUBLIC_KEY = "public";');
      expect(() => checkClientSecrets(root)).not.toThrow();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('does not initiate or claim payment success through legacy IPC', async () => {
    const source = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
    const start = source.indexOf("for (const channel of ['initiate-zain-cash-payment'");
    const end = source.indexOf('ipcMain.handle("open-external-url"', start);
    expect(start).toBeGreaterThan(0);
    const handlers = new Map<string, () => Promise<any>>();
    new Function('ipcMain', source.slice(start, end))({ handle: (k: string, fn: any) => handlers.set(k, fn) });
    for (const fn of handlers.values()) expect(await fn()).toMatchObject({ success: false, code: 'SERVER_PAYMENT_REQUIRED' });
    expect(handlers.size).toBe(2);
    expect(source).not.toContain('generateZainCashToken');
    for (const config of ['vite.config.ts', 'vite.config.js']) {
      expect(fs.readFileSync(config, 'utf8')).not.toContain('__ZAINCASH_SECRET__');
    }
  });
});
