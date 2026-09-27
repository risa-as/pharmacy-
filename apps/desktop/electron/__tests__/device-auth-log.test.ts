import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

const event = { path: '/api/desktop/operations/session', code: 'DEVICE_SIGNATURE_INVALID', status: 403, attempt: 1,
    outcome: 'rejected' as const, localKeyMatchesEnrollment: true, clockSkewSeconds: 2, elapsedMs: 180 };
const lines = (file: string) => readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));

it('keeps events on disk across an app restart (a fresh module and logger)', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'device-auth-'));
    const first = await import('../device-auth-log');
    first.createDeviceAuthLog({ directory: () => directory, build: () => '1.0.21+abc1234', now: () => new Date('2026-09-27T08:00:00Z') })(event);
    vi.resetModules();
    const reopened = await import('../device-auth-log');
    reopened.createDeviceAuthLog({ directory: () => directory, build: () => '1.0.21+abc1234' })({ ...event, attempt: 2, outcome: 'recovered' });
    const saved = lines(path.join(directory, reopened.DEVICE_AUTH_LOG_FILE));
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual({ at: '2026-09-27T08:00:00.000Z', build: '1.0.21+abc1234', ...event });
    expect(saved[1]).toMatchObject({ attempt: 2, outcome: 'recovered' });
});

it('rotates past the size limit and keeps one previous file', async () => {
    const { createDeviceAuthLog, DEVICE_AUTH_LOG_FILE } = await import('../device-auth-log');
    const directory = mkdtempSync(path.join(tmpdir(), 'device-auth-'));
    const record = createDeviceAuthLog({ directory: () => directory, build: () => 'b', maxBytes: 400 });
    for (let i = 0; i < 6; i++) record({ ...event, elapsedMs: i });
    const current = path.join(directory, DEVICE_AUTH_LOG_FILE);
    expect(existsSync(current + '.1')).toBe(true);
    expect(readFileSync(current).length).toBeLessThanOrEqual(400);
    expect(lines(current).at(-1).elapsedMs).toBe(5);
});

it('never throws when the log cannot be written', async () => {
    const { createDeviceAuthLog } = await import('../device-auth-log');
    const directory = mkdtempSync(path.join(tmpdir(), 'device-auth-'));
    const notADirectory = path.join(directory, 'file');
    writeFileSync(notADirectory, 'x');
    expect(() => createDeviceAuthLog({ directory: () => notADirectory, build: () => 'b' })(event)).not.toThrow();
    expect(() => createDeviceAuthLog({ directory: () => { throw Error('no app'); }, build: () => 'b' })(event)).not.toThrow();
});

it('derives clock skew from the server Date header, or null', async () => {
    const { clockSkewSeconds } = await import('../device-auth-log');
    expect(clockSkewSeconds(Date.parse('2026-09-27T08:00:30Z'), 'Sun, 27 Sep 2026 08:00:00 GMT')).toBe(30);
    expect(clockSkewSeconds(Date.now(), null)).toBeNull();
    expect(clockSkewSeconds(Date.now(), 'not a date')).toBeNull();
});
