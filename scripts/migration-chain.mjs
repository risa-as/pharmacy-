// Shared helpers for bootstrap-empty-db.mjs and baseline-existing-db.mjs.
// Every Prisma call gets its DATABASE_URL explicitly; the caller's environment
// DATABASE_URL is never used.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const WEB = join(ROOT, 'apps/web');
export const SCHEMA = join(WEB, 'prisma/schema.prisma');
export const MIGRATIONS = join(WEB, 'prisma/migrations');
// pnpm may link the CLI in the app or hoist it to the workspace root.
const require = createRequire(join(WEB, 'package.json'));
const PRISMA = require.resolve('prisma/build/index.js');

export const migrationNames = () => readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const sqlOf = (name) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
/** Prisma's checksum: SHA-256 of the migration.sql bytes. */
export const checksum = (name) => createHash('sha256').update(readFileSync(join(MIGRATIONS, name, 'migration.sql'))).digest('hex');

export function postgresUrl(value, label) {
    if (!value) throw new Error(`${label} is required.`);
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.pathname.slice(1)) throw new Error(`${label} must name a PostgreSQL database.`);
    return url;
}
export const sameDatabase = (a, b) => a.hostname === b.hostname && (a.port || '5432') === (b.port || '5432') && a.pathname === b.pathname;

export function prisma(args, databaseUrl) {
    if (!PRISMA) throw new Error('Prisma CLI not found; run pnpm install.');
    const r = spawnSync(process.execPath, [PRISMA, ...args], { cwd: WEB, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DATABASE_URL: databaseUrl ?? '' } });
    if (r.error) throw r.error;
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

export function client(url) {
    const require = createRequire(join(WEB, 'package.json'));
    const { PrismaClient } = require('@prisma/client');
    return new PrismaClient({ datasources: { db: { url } } });
}

/** Tables, views, sequences and enums outside the system schemas. */
export async function isEmpty(db) {
    const objects = await db.$queryRawUnsafe(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')`);
    const enums = await db.$queryRawUnsafe(`SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE t.typtype='e' AND n.nspname NOT IN ('pg_catalog','information_schema')`);
    const other = await db.$queryRawUnsafe(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
        UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
        UNION ALL SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%'
        UNION ALL SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql'`);
    return objects.length === 0 && enums.length === 0 && other.length === 0;
}

/** Compare definitions with a freshly replayed shadow, not merely object names. */
export async function sqlObjectDefinitions(db) {
    return db.$queryRawUnsafe(`
        SELECT 'function' AS kind, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS identity,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prokind IN ('f','p')
        UNION ALL
        SELECT 'trigger', c.relname || '.' || t.tgname,
            pg_get_triggerdef(t.oid) || ' ENABLED=' || t.tgenabled::text
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal
        UNION ALL
        SELECT 'sequence', c.relname,
            concat_ws(',', s.seqtypid::regtype::text,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)
        FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public'
        ORDER BY kind, identity`);
}

export async function changedSqlObjects(target, shadow) {
    const [actual, expected] = await Promise.all([sqlObjectDefinitions(target), sqlObjectDefinitions(shadow)]);
    const byKey = new Map(actual.map(o => [o.kind + ':' + o.identity, o.definition]));
    return expected.filter(o => byKey.get(o.kind + ':' + o.identity) !== o.definition)
        .map(o => o.kind + ':' + o.identity);
}

/** A migrations directory holding only the first `count` migrations (state after `count`). */
export function prefixSchema(names, count) {
    const dir = mkdtempSync(join(tmpdir(), 'faramace-chain-'));
    mkdirSync(join(dir, 'migrations'));
    cpSync(join(MIGRATIONS, 'migration_lock.toml'), join(dir, 'migrations/migration_lock.toml'));
    for (const n of names.slice(0, count)) cpSync(join(MIGRATIONS, n), join(dir, 'migrations', n), { recursive: true });
    writeFileSync(join(dir, 'schema.prisma'), readFileSync(SCHEMA, 'utf8'));
    return join(dir, 'migrations');
}

/** Exit code of `prisma migrate diff` between the chain after `count` migrations and a database (0 = identical). */
export function diffAgainstPrefix(names, count, targetUrl, shadowUrl, script = false) {
    const from = count === 0 ? ['--from-empty'] : ['--from-migrations', prefixSchema(names, count), '--shadow-database-url', shadowUrl];
    return prisma(['migrate', 'diff', ...from, '--to-url', targetUrl, script ? '--script' : '--exit-code'], null);
}
export const diffAgainstSchema = (targetUrl) => prisma(['migrate', 'diff', '--from-url', targetUrl, '--to-schema-datamodel', SCHEMA, '--exit-code'], null);

const strip = (sql) => sql.replace(/--[^\n]*/g, '');
/**
 * SQL objects that the first `count` migrations leave in place and that Prisma's
 * schema cannot describe (functions, triggers, sequences), so `migrate diff`
 * does not see them.
 */
export function sqlObjects(names, count) {
    const objects = new Map();
    for (const name of names.slice(0, count)) {
        const sql = strip(sqlOf(name));
        for (const [, fn] of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)\s*\(/g)) objects.set(`function ${fn}`, { kind: 'function', name: fn, from: name });
        for (const [, tg] of sql.matchAll(/CREATE TRIGGER (\w+)/g)) objects.set(`trigger ${tg}`, { kind: 'trigger', name: tg, from: name });
        for (const [, sq] of sql.matchAll(/CREATE SEQUENCE (?:IF NOT EXISTS )?"?(\w+)"?/g)) objects.set(`sequence ${sq}`, { kind: 'sequence', name: sq, from: name });
        for (const [, fn] of sql.matchAll(/DROP FUNCTION (?:IF EXISTS )?(\w+)/g)) objects.delete(`function ${fn}`);
        for (const [, tg] of sql.matchAll(/DROP TRIGGER (?:IF EXISTS )?(\w+)/g)) objects.delete(`trigger ${tg}`);
        for (const [, sq] of sql.matchAll(/DROP SEQUENCE (?:IF EXISTS )?"?(\w+)"?/g)) objects.delete(`sequence ${sq}`);
    }
    return [...objects.values()];
}
export async function missingObjects(db, objects) {
    const missing = [];
    for (const o of objects) {
        const q = o.kind === 'function' ? `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1`
            : o.kind === 'trigger' ? `SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname=$1`
            : `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND c.relname=$1`;
        if ((await db.$queryRawUnsafe(q, o.name)).length === 0) missing.push(o);
    }
    return missing;
}

/**
 * Data statements a migration runs (UPDATE / INSERT / DELETE, sequence positions);
 * `resolve` does not run them. Function bodies ($$ … $$) are not steps.
 */
export function dataSteps(name) {
    return strip(sqlOf(name)).replace(/\$\$[\s\S]*?\$\$/g, '$$$$').split(';').map((s) => s.trim())
        .filter((s) => /^(WITH\b[\s\S]*\b(UPDATE|INSERT|DELETE)\b|UPDATE\b|INSERT\b|DELETE\b|SELECT\s+setval\b)/i.test(s))
        .map((s) => s.split('\n')[0].slice(0, 120));
}
