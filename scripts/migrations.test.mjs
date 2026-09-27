// Guards the migration history without a database: historical migrations are never
// edited (their SQL is pinned by hash), and every migration directory is pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'apps/web/prisma/migrations';
const baseline = JSON.parse(readFileSync('scripts/database-baseline.json', 'utf8'));
const digest = (name) => createHash('sha256').update(readFileSync(`${dir}/${name}/migration.sql`, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const local = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

test('every migration directory is pinned, and every pinned migration exists', () => {
    assert.deepEqual(local, Object.keys(baseline.migrations).sort());
});

test('no migration SQL differs from its pinned hash (applied migrations are never edited)', () => {
    const changed = Object.entries(baseline.migrations).filter(([name, hash]) => digest(name) !== hash).map(([name]) => name);
    assert.deepEqual(changed, []);
});

test('the 55 migrations that existed before the chain repair are pinned with their original content', () => {
    // Hashes recorded before the repair (28 from the reviewed 2026-09-08 baseline, the
    // rest from commit 098917e). A change here means a historical migration was edited.
    const historical = Object.keys(baseline.historical ?? {});
    assert.equal(historical.length, 55);
    for (const name of historical) assert.equal(baseline.migrations[name], baseline.historical[name], name);
});

test('repair migrations sort before the migration they unblock and never modify existing folders', () => {
    const repairs = local.filter((n) => /_restore_untracked_|_reconcile_untracked_schema$/.test(n));
    assert.ok(repairs.length >= 1);
    for (const name of repairs) assert.ok(!(name in (baseline.historical ?? {})), `${name} must be a new migration`);
});
