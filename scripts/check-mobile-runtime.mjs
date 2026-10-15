import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const app = JSON.parse(read('apps/mobile/app.json')).expo;
const pkg = JSON.parse(read('apps/mobile/package.json'));
const { version, runtimeVersion, ...nativeConfig } = app;
const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
};
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const expected = {
    version,
    configHash: hash(nativeConfig),
    dependenciesHash: hash(pkg.dependencies),
    // Conservative: transitive native dependency changes can affect compatibility.
    lockHash: createHash('sha256').update(read('pnpm-lock.yaml').replace(/\r\n/g, '\n')).digest('hex'),
};
const snapshotPath = resolve(root, 'apps/mobile/native-runtime.json');
const recorded = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, 'utf8')) : null;
const matches = recorded && JSON.stringify(canonical(recorded)) === JSON.stringify(canonical(expected));
if (runtimeVersion?.policy !== 'appVersion') throw new Error('Mobile runtime must use the appVersion compatibility policy.');
if (process.argv.includes('--record')) {
    if (recorded && !matches && recorded.version === version) {
        throw new Error('Native configuration or dependencies changed. Bump expo.version before recording a new native runtime, then create and distribute a new build.');
    }
    writeFileSync(snapshotPath, JSON.stringify(expected, null, 2) + '\n');
    console.log(`Recorded mobile native runtime ${version}. Create a fresh build before publishing updates.`);
} else if (!matches) {
    throw new Error('Mobile native compatibility changed. Bump expo.version, run node scripts/check-mobile-runtime.mjs --record, then create and distribute a new build. OTA publication stopped. Lockfile changes are treated conservatively as native changes.');
} else {
    console.log(`Mobile native runtime ${version} is compatible with the recorded release configuration.`);
}
