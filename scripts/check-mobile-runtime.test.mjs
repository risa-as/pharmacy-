import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('native compatibility guard permits JS changes and rejects incompatible OTA releases', () => {
    const root = mkdtempSync(join(tmpdir(), 'faramace-runtime-test-'));
    const mobile = join(root, 'apps/mobile');
    mkdirSync(mobile, { recursive: true });
    mkdirSync(join(root, 'scripts'));
    const script = join(root, 'scripts/check-mobile-runtime.mjs');
    copyFileSync(new URL('./check-mobile-runtime.mjs', import.meta.url), script);
    let config = { expo: { version: '1.0.1', runtimeVersion: { policy: 'appVersion' }, icon: './icon.png', android: { package: 'com.faramace.mobile' } } };
    const saveConfig = () => writeFileSync(join(mobile, 'app.json'), JSON.stringify(config));
    const savePackage = version => writeFileSync(join(mobile, 'package.json'), JSON.stringify({ dependencies: { expo: version } }));
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const pass = (...args) => { const result = run(...args); assert.equal(result.status, 0, result.stderr); };
    const fail = (...args) => assert.notEqual(run(...args).status, 0);
    try {
        saveConfig(); savePackage('54.0.35');
        writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n');
        writeFileSync(join(mobile, 'icon.png'), 'native-icon');
        fail();
        pass('--record'); pass();
        writeFileSync(join(mobile, 'screen.tsx'), 'export default function Screen() { return null; }');
        pass();
        savePackage('54.0.37');
        fail(); fail('--record');
        savePackage('54.0.35'); pass();
        config.expo.android.package = 'com.faramace.changed'; saveConfig();
        fail();
        config.expo.android.package = 'com.faramace.mobile'; saveConfig(); pass();
        writeFileSync(join(mobile, 'icon.png'), 'changed-native-icon'); fail();
        writeFileSync(join(mobile, 'icon.png'), 'native-icon'); pass();
        writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n# dependency change\n');
        fail(); fail('--record');
        config.expo.version = '1.0.2'; saveConfig();
        pass('--record'); pass();
    } finally {
        assert.ok(resolve(root).startsWith(resolve(tmpdir()) + requireSeparator()));
        assert.ok(root.includes('faramace-runtime-test-'));
        rmSync(root, { recursive: true, force: true });
    }
});

function requireSeparator() { return process.platform === 'win32' ? '\\' : '/'; }
