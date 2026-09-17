import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { stringify } from 'yaml';

const guard = resolve('scripts/check-dependencies.mjs');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'faramace-guard-'));
  mkdirSync(join(dir, 'apps')); mkdirSync(join(dir, 'packages'));
  const pkg = { packageManager: 'pnpm@8.15.4', pnpm: { overrides: { example: '1.0.0' } }, dependencies: { example: '^1.0.0' } };
  const lock = { lockfileVersion: '6.0', overrides: pkg.pnpm.overrides, importers: { '.': { dependencies: { example: { specifier: '1.0.0', version: '1.0.0' } } } } };
  const save = () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), stringify({ overrides: pkg.pnpm.overrides }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), stringify(lock));
  };
  save();
  return { dir, pkg, lock, save, run: (...args) => spawnSync(process.execPath, [guard, ...args], { cwd: dir, encoding: 'utf8' }) };
}
test('allows metadata-only changes with an unchanged lock', () => {
  const f = fixture(); f.pkg.description = 'metadata'; f.save(); assert.equal(f.run().status, 0);
});
test('rejects new dependencies absent from lock', () => {
  const f = fixture(); f.pkg.dependencies.newPackage = '1.0.0'; f.save(); assert.equal(f.run().status, 1);
});
test('rejects divergent override lists', () => {
  const f = fixture(); writeFileSync(join(f.dir, 'pnpm-workspace.yaml'), 'overrides: {}'); assert.equal(f.run().status, 1);
});
test('checks the staged snapshot even if the working tree was repaired', () => {
  const f = fixture(); execFileSync('git', ['init', '-q'], { cwd: f.dir });
  f.pkg.dependencies.newPackage = '1.0.0'; f.save();
  execFileSync('git', ['add', '.'], { cwd: f.dir });
  delete f.pkg.dependencies.newPackage; f.save();
  assert.equal(f.run().status, 0);
  assert.equal(f.run('--staged').status, 1);
});
test('staged valid snapshot passes despite an unrelated unstaged dependency edit', () => {
  const f = fixture(); execFileSync('git', ['init', '-q'], { cwd: f.dir }); execFileSync('git', ['add', '.'], { cwd: f.dir });
  f.pkg.dependencies.newPackage = '1.0.0'; f.save();
  assert.equal(f.run('--staged').status, 0);
  assert.equal(f.run().status, 1);
});
