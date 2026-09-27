import fs from 'node:fs';
import path from 'node:path';

/**
 * Durable record of device-proof rejections, for diagnosing intermittent ones
 * after the app was closed. One JSON line per event in the app data folder.
 *
 * Never recorded: signatures, keys, fingerprints, license keys, tokens, query
 * strings or request bodies. Writing must never affect sale or sync: every
 * failure here is swallowed.
 */
export const DEVICE_AUTH_LOG_FILE = 'device-auth.log';
/** Rotated to `device-auth.log.1` past this size; one previous file is kept. */
export const DEVICE_AUTH_LOG_MAX_BYTES = 256 * 1024;

export type DeviceAuthEvent = {
    /** Request path without query string. */
    path: string;
    /** Server code (DEVICE_*), or TPM_SIGN_FAILED when the key could not sign. */
    code: string;
    status: number | null;
    /** 1 for the first try, 2 for the single re-signed session retry. */
    attempt: number;
    /** retrying: rejected, a re-signed retry follows; recovered: the retry was accepted; rejected: final. */
    outcome: 'retrying' | 'recovered' | 'rejected';
    /** Whether the key Windows holds now has the enrolled fingerprint; null if unreadable. */
    localKeyMatchesEnrollment: boolean | null;
    /** Device clock minus server clock (from the response Date header), in seconds; null if unknown. */
    clockSkewSeconds: number | null;
    /** From signing to the response, in milliseconds. */
    elapsedMs: number;
};

export function createDeviceAuthLog(options: {
    directory: () => string;
    build: () => string;
    now?: () => Date;
    maxBytes?: number;
}) {
    const maxBytes = options.maxBytes ?? DEVICE_AUTH_LOG_MAX_BYTES;
    return function record(event: DeviceAuthEvent) {
        try {
            const directory = options.directory();
            const file = path.join(directory, DEVICE_AUTH_LOG_FILE);
            const line = JSON.stringify({ at: (options.now?.() ?? new Date()).toISOString(), build: options.build(), ...event }) + '\n';
            fs.mkdirSync(directory, { recursive: true });
            let size = 0;
            try { size = fs.statSync(file).size; } catch { /* first write */ }
            if (size > 0 && size + Buffer.byteLength(line) > maxBytes) fs.renameSync(file, file + '.1');
            fs.appendFileSync(file, line);
        } catch { /* diagnostics must never block the operation */ }
    };
}

/** Device clock minus the server's Date header, in whole seconds. */
export function clockSkewSeconds(sentAtMs: number, serverDate: string | null): number | null {
    const server = serverDate ? Date.parse(serverDate) : NaN;
    return Number.isNaN(server) ? null : Math.round((sentAtMs - server) / 1000);
}
