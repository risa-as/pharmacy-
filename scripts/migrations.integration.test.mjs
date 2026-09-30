// Migration chain and baseline tests on a LOCAL, isolated PostgreSQL only.
//
//   MIGRATION_TEST_ADMIN_URL=postgresql://user:pass@127.0.0.1:5432/postgres \
//     node --test --test-concurrency=1 scripts/migrations.integration.test.mjs
//
// Creates and drops databases named faramace_migration_test_*; never reads
// DATABASE_URL. Fixtures that imitate existing customer databases are built the
// way those were built (`prisma db push` plus hand-run SQL objects); that is only
// how the fixture is made, the paths under test are `migrate deploy` and the
// baseline script.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ADMIN = process.env.MIGRATION_TEST_ADMIN_URL;
if (!ADMIN) throw new Error('MIGRATION_TEST_ADMIN_URL is required (a local PostgreSQL admin connection).');
const admin = new URL(ADMIN);
if (!['localhost', '127.0.0.1'].includes(admin.hostname)) throw new Error('Migration tests run only against a local PostgreSQL.');

const ROOT = resolve('.');
const WEB = join(ROOT, 'apps/web');
const MIGRATIONS = join(WEB, 'prisma/migrations');
const SCHEMA = join(WEB, 'prisma/schema.prisma');
// pnpm may link the CLI in the app or hoist it to the workspace root.
const PRISMA = createRequire(join(WEB, 'package.json')).resolve('prisma/build/index.js');
const PREFIX = `faramace_migration_test_${process.pid}_`;
const created = new Set();
const all = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
// The migrations that existed before the chain repair (pinned in database-baseline.json).
const pinned = JSON.parse(readFileSync('scripts/database-baseline.json', 'utf8')).historical;
const historical = pinned ? Object.keys(pinned).sort() : all;
// The old db-push fixture has the table schema but predates function settings.
const functionSettingsMigration = '20260930120000_pin_function_search_path';
const beforeFunctionSettings = all.indexOf(functionSettingsMigration);
const work = mkdtempSync(join(tmpdir(), 'faramace-migrations-'));

const url = (name) => { const u = new URL(ADMIN); u.pathname = `/${name}`; return u.toString(); };
const run = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, DATABASE_URL: '', ...opts.env } });
    if (r.error) throw new Error(`Test command ${cmd} failed: ${r.error.code}`);
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const psql = (db, sql) => {
    const r = run('psql', ['-w', url(db), '-v', 'ON_ERROR_STOP=1', '-Atqc', sql]);
    if (r.code !== 0) throw new Error(r.out);
    return r.out.trim();
};
const createDb = (suffix) => {
    const name = PREFIX + suffix;
    psql('postgres', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    psql('postgres', `CREATE DATABASE "${name}"`);
    created.add(name);
    return name;
};
const prisma = (args, db, opts = {}) => run(process.execPath, [PRISMA, ...args], { cwd: WEB, ...opts, env: { DATABASE_URL: db ? url(db) : '', ...opts.env } });
const schemaDiff = (db) => prisma(['migrate', 'diff', '--from-url', url(db), '--to-schema-datamodel', SCHEMA, '--exit-code'], null).code;
/** A migrations directory with only the given migrations (for building older states). */
const chainDir = (names) => {
    const dir = mkdtempSync(join(work, 'chain-'));
    mkdirSync(join(dir, 'migrations'));
    cpSync(join(MIGRATIONS, 'migration_lock.toml'), join(dir, 'migrations/migration_lock.toml'));
    for (const n of names) cpSync(join(MIGRATIONS, n), join(dir, 'migrations', n), { recursive: true });
    writeFileSync(join(dir, 'schema.prisma'), readFileSync(SCHEMA, 'utf8'));
    return join(dir, 'schema.prisma');
};
const deploy = (db, names = all) => prisma(['migrate', 'deploy', '--schema', chainDir(names)], db);
const recorded = (db) => psql(db, `SELECT coalesce(string_agg(migration_name, ',' ORDER BY migration_name), '') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).split(',').filter(Boolean);
const hasMigrationsTable = (db) => psql(db, `SELECT to_regclass('_prisma_migrations') IS NOT NULL`) === 't';
const baseline = (target, shadow, ...flags) => run('node', ['scripts/baseline-existing-db.mjs', ...flags], {
    // A nonmatching historical schema can require replaying every prefix.
    cwd: ROOT, timeout: 600_000, env: { TARGET_DATABASE_URL: url(target), SHADOW_DATABASE_URL: url(shadow) },
});
/** Columns, recorded migrations and row count: equal before/after means nothing was changed. */
const fingerprint = (db) => [
    psql(db, `SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type, '|' ORDER BY table_name, column_name)) FROM information_schema.columns WHERE table_schema='public'`),
    hasMigrationsTable(db) ? recorded(db).join(',') : 'no history',
    psql(db, `SELECT count(*) FROM "Organization"`),
].join(' / ');

// SQL objects that only migrations create (Prisma's schema cannot express them).
const sqlObjects = (names) => {
    const pre = [], post = [];
    for (const n of names) {
        // Keep function bodies verbatim; stripping comments changes pg_get_functiondef.
        const sql = readFileSync(join(MIGRATIONS, n, 'migration.sql'), 'utf8');
        for (const m of sql.matchAll(/CREATE SEQUENCE[^;]*;/g)) pre.push(m[0].replace(/CREATE SEQUENCE (IF NOT EXISTS )?/, 'CREATE SEQUENCE IF NOT EXISTS '));
        for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION [\s\S]*?\$\$[\s\S]*?\$\$;/g)) {
            const s = m[0].replace(/^CREATE FUNCTION/, 'CREATE OR REPLACE FUNCTION');
            (/RETURNS trigger/.test(s) ? post : pre).push(s);
        }
        for (const m of sql.matchAll(/CREATE TRIGGER[\s\S]*?;/g)) post.push(m[0]);
    }
    return { pre, post };
};
/** Imitates a customer database: `db push` of a schema plus the hand-run SQL objects. */
const pushBuilt = (db, schemaText, objectsFrom) => {
    const dir = mkdtempSync(join(work, 'push-'));
    writeFileSync(join(dir, 'schema.prisma'), schemaText);
    const { pre, post } = sqlObjects(objectsFrom);
    if (pre.length) psql(db, pre.join('\n'));
    const r = prisma(['db', 'push', '--schema', join(dir, 'schema.prisma'), '--skip-generate', '--accept-data-loss'], db);
    if (r.code !== 0) throw new Error(r.out);
    if (post.length) psql(db, post.join('\n'));
};
const seed = (db) => psql(db, `
    INSERT INTO "Organization"(id, name, "updatedAt") VALUES ('org-1', 'Pharmacy', now()), ('org-2', 'Other', now());
    INSERT INTO "Branch"(id, name, "organizationId", "updatedAt") VALUES ('br-1', 'Main', 'org-1', now());
    INSERT INTO "Supplier"(id, name, "updatedAt") VALUES ('sup-1', 'Supplier', now());`);
const rows = (db) => psql(db, `SELECT (SELECT count(*) FROM "Organization")||'/'||(SELECT count(*) FROM "Branch")||'/'||(SELECT count(*) FROM "Supplier")`);
/** pg_dump → a new database: upgrades always run on the restored copy. */
const restoreCopy = (source, suffix) => {
    const copy = createDb(suffix);
    // Custom archives preserve stored function bodies byte-for-byte on Windows.
    const dumpFile = join(work, `${suffix}.dump`);
    const dump = run('pg_dump', ['-w', '--no-owner', '--no-privileges', '-Fc', '-f', dumpFile, url(source)]);
    if (dump.code !== 0) throw new Error(dump.out);
    const load = run('pg_restore', ['-w', '--no-owner', '--no-privileges', '--exit-on-error', '-d', url(copy), dumpFile]);
    if (load.code !== 0) throw new Error(load.out);
    return copy;
};

after(() => { for (const name of created) psql('postgres', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); rmSync(work, { recursive: true, force: true }); });

describe('new database: the chain alone builds the schema', () => {
    it('prisma migrate deploy on an empty database applies every migration and ends exactly at schema.prisma', () => {
        const db = createDb('empty');
        const r = deploy(db);
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(recorded(db), all);
        assert.equal(schemaDiff(db), 0);
        const functions = psql(db, `SELECT string_agg(proname, ',' ORDER BY proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE nspname = 'public'`);
        const triggers = psql(db, `SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal`);
        assert.equal(functions, 'assign_warehouse_credit_note,enforce_sale_invoice_scope,next_document_reference,next_warehouse_credit_note,next_warehouse_order_number,refresh_branch_invoice_scope');
        assert.equal(triggers, 'branch_invoice_scope,sale_invoice_scope,warehouse_credit_note_number');
    });
    it('bootstrap-empty-db.mjs builds a new database with migrate deploy only, and refuses a non-empty one', () => {
        const db = createDb('bootstrap');
        const ok = run('node', ['scripts/bootstrap-empty-db.mjs'], { cwd: ROOT, env: { NEW_DATABASE_URL: url(db) } });
        assert.equal(ok.code, 0, ok.out);
        assert.doesNotMatch(ok.out, /db push|resolve --applied/);
        assert.deepEqual(recorded(db), all);
        assert.equal(schemaDiff(db), 0);
        const again = run('node', ['scripts/bootstrap-empty-db.mjs'], { cwd: ROOT, env: { NEW_DATABASE_URL: url(db) } });
        assert.notEqual(again.code, 0);
        assert.match(again.out, /non-empty/);
    });
});

describe('existing database: upgrade of a restored copy', () => {
    it('customer database built with db push (no migration history): check is read-only; apply needs the data-step review, then records and matches', () => {
        const source = createDb('push_current');
        pushBuilt(source, readFileSync(SCHEMA, 'utf8'), historical);
        seed(source);
        const before = fingerprint(source);
        const copy = restoreCopy(source, 'push_current_copy');
        const shadow = createDb('shadow_a');

        const check = baseline(copy, shadow);
        assert.equal(check.code, 0, check.out);
        assert.match(check.out, new RegExp(`matches the chain after ${beforeFunctionSettings} of ${all.length} migrations`));
        assert.match(check.out, /applying 1 migration\(s\) with migrate deploy/);
        assert.equal(hasMigrationsTable(copy), false, 'check mode never writes');

        const refused = baseline(copy, shadow, '--apply');
        assert.notEqual(refused.code, 0);
        assert.match(refused.out, /data steps/);
        assert.equal(hasMigrationsTable(copy), false);

        const applied = baseline(copy, shadow, '--apply', '--data-steps-reviewed');
        assert.equal(applied.code, 0, applied.out);
        assert.deepEqual(recorded(copy), all);
        assert.equal(schemaDiff(copy), 0);
        assert.equal(rows(copy), '2/1/1');
        assert.equal(deploy(copy).code, 0, 'a later migrate deploy has nothing left to do');
        assert.equal(fingerprint(source), before, 'the source database is untouched');
    });
    it('database made by the previous bootstrap (55 historical migrations recorded): only the repair migrations are recorded', () => {
        const source = createDb('old_bootstrap');
        pushBuilt(source, readFileSync(SCHEMA, 'utf8'), historical);
        for (const n of historical) assert.equal(prisma(['migrate', 'resolve', '--applied', n, '--schema', chainDir(historical)], source).code, 0);
        seed(source);
        const copy = restoreCopy(source, 'old_bootstrap_copy');
        const shadow = createDb('shadow_b');
        const applied = baseline(copy, shadow, '--apply');
        assert.equal(applied.code, 0, applied.out);
        const repairs = all.slice(0, beforeFunctionSettings).filter((n) => !historical.includes(n));
        assert.match(applied.out, new RegExp(`recording ${repairs.length} migration`));
        assert.deepEqual(recorded(copy), all);
        assert.equal(schemaDiff(copy), 0);
        assert.equal(rows(copy), '2/1/1');
    });
    it('database built by the chain up to an older migration: nothing is recorded by hand, the rest is applied by migrate deploy', () => {
        const source = createDb('chain_prefix');
        const upTo = all.slice(0, 40);
        assert.equal(deploy(source, upTo).code, 0);
        seed(source);
        const copy = restoreCopy(source, 'chain_prefix_copy');
        const shadow = createDb('shadow_c');
        const applied = baseline(copy, shadow, '--apply');
        assert.equal(applied.code, 0, applied.out);
        assert.match(applied.out, /recording 0 migration/);
        assert.match(applied.out, new RegExp(`applying ${all.length - 40} migration`));
        assert.deepEqual(recorded(copy), all);
        assert.equal(schemaDiff(copy), 0);
        assert.equal(rows(copy), '2/1/1');
    });
});

describe('existing database: the baseline refuses and changes nothing', () => {
    it('accepts audited rolled-back attempts but rejects an unresolved failed attempt', () => {
        const db = createDb('history_attempts');
        assert.equal(deploy(db).code, 0);
        const shadow = createDb('shadow_history');
        psql(db, `INSERT INTO _prisma_migrations(id, checksum, migration_name, started_at, rolled_back_at, applied_steps_count)
            VALUES ('audit-old-attempt', 'old-failed-checksum', '${all[0]}', now(), now(), 0)`);
        const before = fingerprint(db);
        let r = baseline(db, shadow);
        assert.equal(r.code, 0, r.out);
        assert.equal(fingerprint(db), before);
        psql(db, "UPDATE _prisma_migrations SET rolled_back_at=NULL WHERE id='audit-old-attempt'");
        r = baseline(db, shadow, '--apply');
        assert.notEqual(r.code, 0);
        assert.match(r.out, /unfinished/);
    });
    it('rejects disabled triggers and changed function bodies despite matching names', () => {
        const db = createDb('changed_objects');
        assert.equal(deploy(db).code, 0);
        const shadow = createDb('shadow_changed');
        psql(db, 'ALTER TABLE "Sale" DISABLE TRIGGER sale_invoice_scope');
        const before = fingerprint(db);
        let r = baseline(db, shadow, '--apply');
        assert.notEqual(r.code, 0, r.out);
        assert.match(r.out, /definitions or enabled state/);
        assert.equal(fingerprint(db), before);
        psql(db, 'ALTER TABLE "Sale" ENABLE TRIGGER sale_invoice_scope');
        const fn = psql(db, `SELECT p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgname='sale_invoice_scope'`);
        psql(db, `CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
        r = baseline(db, shadow, '--apply');
        assert.notEqual(r.code, 0, r.out);
        assert.match(r.out, /function:/);
        assert.equal(fingerprint(db), before);
    });
    it('refuses a shadow containing only a function and preserves it', () => {
        const db = createDb('function_guard');
        const shadow = createDb('shadow_function');
        psql(shadow, 'CREATE FUNCTION keep_me() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$');
        const r = baseline(db, shadow);
        assert.notEqual(r.code, 0);
        assert.match(r.out, /not empty/);
        assert.equal(psql(shadow, 'SELECT keep_me()'), '1');
    });
    it('a SQL object a migration creates is missing (trigger dropped) → refused, even with the data-step review', () => {
        const db = createDb('missing_trigger');
        pushBuilt(db, readFileSync(SCHEMA, 'utf8'), historical);
        psql(db, 'DROP TRIGGER sale_invoice_scope ON "Sale"');
        const shadow = createDb('shadow_d');
        const r = baseline(db, shadow, '--apply', '--data-steps-reviewed');
        assert.notEqual(r.code, 0);
        assert.match(r.out, /sale_invoice_scope/);
        assert.equal(hasMigrationsTable(db), false);
    });
    it('a database at an older pushed schema matches no point of the chain → refused with the difference, unchanged', () => {
        const db = createDb('old_push');
        const old = run('git', ['show', '098917e~40:apps/web/prisma/schema.prisma'], { cwd: ROOT });
        assert.equal(old.code, 0, old.out);
        pushBuilt(db, old.out, historical.filter((n) => n < '20260920000000'));
        const before = fingerprint(db);
        const shadow = createDb('shadow_e');
        const r = baseline(db, shadow, '--apply', '--data-steps-reviewed');
        assert.notEqual(r.code, 0);
        assert.match(r.out, /matches no point of the migration chain/);
        assert.equal(fingerprint(db), before);
    });
    it('a recorded migration whose checksum differs from the local file → refused', () => {
        const db = createDb('checksum');
        assert.equal(deploy(db, all.slice(0, 10)).code, 0);
        psql(db, `UPDATE _prisma_migrations SET checksum = 'edited' WHERE migration_name = '${all[3]}'`);
        const shadow = createDb('shadow_f');
        const r = baseline(db, shadow, '--apply');
        assert.notEqual(r.code, 0);
        assert.match(r.out, new RegExp(`${all[3]}.*checksum`));
        assert.deepEqual(recorded(db), all.slice(0, 10));
    });
    it('refuses an unsafe shadow database (the target itself, a non-shadow name, or a non-empty one)', () => {
        const db = createDb('guards');
        const notShadow = createDb('scratch');
        const dirty = createDb('shadow_dirty');
        psql(dirty, 'CREATE TABLE keep_me (x int)');
        assert.match(baseline(db, db).out, /same database/);
        assert.match(baseline(db, notShadow).out, /shadow/);
        assert.match(baseline(db, dirty).out, /not empty/);
        assert.equal(psql(dirty, `SELECT to_regclass('keep_me') IS NOT NULL`), 't');
    });
});
