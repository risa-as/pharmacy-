// Brings an EXISTING database under the migration chain, only after proving where it
// stands. Existing Faramace databases were built with `prisma db push`, so their
// _prisma_migrations history is missing or incomplete; `migrate deploy` alone would
// try to re-create what they already have.
//
//   TARGET_DATABASE_URL=… SHADOW_DATABASE_URL=… node scripts/baseline-existing-db.mjs
//       read-only check (default): prints where the database stands and what would happen
//   … --apply [--data-steps-reviewed] [--report file.json]
//
// Run it on a RESTORED COPY first (see docs/database/migration-baseline.md).
//
// What it does, in order; it stops without writing anything at the first failure:
//  1. _prisma_migrations: no unresolved failures; completed rows have known names and checksums equal
//     to the local files.
//  2. Finds the point k of the chain the database is exactly equal to, with
//     `prisma migrate diff` (the chain after k migrations, replayed on the shadow
//     database, against the target): if the history is an exact prefix, k is its
//     length; otherwise the largest k that matches. No match → refuse.
//  3. SQL objects the first k migrations create (functions, triggers, sequences),
//     which migrate diff cannot see, match the shadow definitions and trigger state.
//  4. Unrecorded migrations up to k that contain data steps are listed; --apply
//     refuses unless --data-steps-reviewed confirms they were checked on this data.
//  5. --apply: re-checks equality, records the unrecorded migrations up to k with
//     `prisma migrate resolve --applied` (the only use of resolve), runs
//     `prisma migrate deploy` for the rest, then verifies the database equals
//     schema.prisma and has every SQL object of the chain.
//
// Never reads DATABASE_URL. The shadow database is wiped by Prisma, so it must be a
// separate, empty database whose name contains "shadow".
import { writeFileSync } from 'node:fs';
import {
    SCHEMA, checksumMatch, client, dataSteps, diffAgainstPrefix, diffAgainstSchema, isEmpty, migrationNames,
    missingObjects, postgresUrl, prisma, sameDatabase, sqlObjects, changedSqlObjects,
} from './migration-chain.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dataReviewed = args.includes('--data-steps-reviewed');
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
class Refused extends Error {}
const fail = (message) => { throw new Refused(message); };
let SHADOW = null, shadowVerified = false, targetMayHaveChanged = false;
/** Objects whose definition differs from the replay only by line endings (reported). */
const lineEndingObjects = new Set();
async function verifyDefinitions(db) {
    const shadow = client(SHADOW);
    try {
        const eolOnly = [];
        const changed = await changedSqlObjects(db, shadow, eolOnly);
        eolOnly.forEach((o) => lineEndingObjects.add(o));
        if (changed.length) fail(`SQL object definitions or enabled state differ from the replayed migrations: ${changed.join(', ')}`);
        if (eolOnly.length) console.log(`SQL objects created from CRLF files, same text: ${eolOnly.join(', ')}`);
    } finally { await shadow.$disconnect(); }
}
/** Prisma leaves the replayed chain in the shadow; empty it again (only a shadow verified empty at the start). */
async function resetShadow() {
    const s = client(SHADOW);
    try { await s.$executeRawUnsafe('DROP SCHEMA public CASCADE'); await s.$executeRawUnsafe('CREATE SCHEMA public'); }
    finally { await s.$disconnect(); }
}

async function main() {
let target, shadow;
try {
    target = postgresUrl(process.env.TARGET_DATABASE_URL, 'TARGET_DATABASE_URL');
    shadow = postgresUrl(process.env.SHADOW_DATABASE_URL, 'SHADOW_DATABASE_URL');
} catch (e) { fail(e.message); }
if (sameDatabase(target, shadow)) fail('TARGET_DATABASE_URL and SHADOW_DATABASE_URL are the same database; Prisma wipes the shadow database.');
if (!/shadow/i.test(shadow.pathname)) fail('SHADOW_DATABASE_URL must name a separate database whose name contains "shadow" (Prisma wipes it).');

const TARGET = target.toString();
SHADOW = shadow.toString();
const names = migrationNames();
const report = { target: `${target.hostname}:${target.port || 5432}${target.pathname}`, migrations: names.length, mode: apply ? 'apply' : 'check' };

const shadowDb = client(SHADOW);
try { if (!(await isEmpty(shadowDb))) fail('the shadow database is not empty; give an empty database made for this run.'); }
finally { await shadowDb.$disconnect(); }
shadowVerified = true;

const db = client(TARGET);
try {
    // 1. Recorded history.
    const hasTable = (await db.$queryRawUnsafe(`SELECT to_regclass('_prisma_migrations') IS NOT NULL AS ok`))[0].ok;
    const rows = hasTable ? await db.$queryRawUnsafe(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`) : [];
    // Prisma retains rolled-back attempts as audit history; only an unresolved
    // failure blocks deploy. Validate applied rows, not superseded attempts.
    const activeRows = rows.filter((r) => !r.rolled_back_at);
    const broken = activeRows.filter((r) => !r.finished_at);
    if (broken.length) fail(`unfinished migrations in _prisma_migrations: ${broken.map((r) => r.migration_name).join(', ')}. Resolve them first.`);
    const unknown = activeRows.filter((r) => !names.includes(r.migration_name));
    if (unknown.length) fail(`the database records migrations that do not exist here: ${unknown.map((r) => r.migration_name).join(', ')}.`);
    // Same text is required; only the line endings may differ from this checkout
    // (listed in the report, never silently).
    const matches = activeRows.map((r) => ({ name: r.migration_name, match: checksumMatch(r.migration_name, r.checksum) }));
    const edited = matches.filter((m) => !m.match);
    if (edited.length) fail(`recorded checksum differs from the local file for: ${edited.map((m) => `${m.name} (checksum)`).join(', ')}. A migration was edited after it was applied.`);
    report.lineEndingOnly = matches.filter((m) => m.match !== 'exact').map((m) => `${m.name} (${m.match})`);
    if (report.lineEndingOnly.length) console.log(`Recorded with other line endings, same text: ${report.lineEndingOnly.join(', ')}`);
    const recorded = new Set(activeRows.map((r) => r.migration_name));
    const lastRecorded = Math.max(-1, ...[...recorded].map((n) => names.indexOf(n)));
    report.recorded = recorded.size;

    // 2. Where the database stands in the chain.
    const exactPrefix = recorded.size > 0 && names.slice(0, recorded.size).every((n) => recorded.has(n));
    let k = -1;
    let mismatchedDefinitions = [];
    if (exactPrefix && diffAgainstPrefix(names, recorded.size, TARGET, SHADOW).code === 0) {
        k = recorded.size;
    } else {
        for (let count = names.length; count > lastRecorded; count--) {
            const r = diffAgainstPrefix(names, count, TARGET, SHADOW);
            if (r.code === 0) {
                // A function-only migration can leave Prisma's table schema
                // unchanged. Do not record it as applied until its SQL objects
                // also match; an older matching prefix must deploy it normally.
                const replay = client(SHADOW);
                try { mismatchedDefinitions = await changedSqlObjects(db, replay); }
                finally { await replay.$disconnect(); }
                if (!mismatchedDefinitions.length) { k = count; break; }
                continue;
            }
            if (r.code !== 2) fail(`prisma migrate diff failed at ${count} migrations:\n${r.out}`);
        }
    }
    if (k < 0) {
        if (mismatchedDefinitions.length) fail(`SQL object definitions or enabled state differ from the replayed migrations: ${mismatchedDefinitions.join(', ')}`);
        const diff = diffAgainstPrefix(names, names.length, TARGET, SHADOW, true);
        fail(`the database matches no point of the migration chain that includes its recorded history.\n`
            + `Difference from the full chain (review; do not apply blindly):\n${diff.out.slice(0, 6000)}`);
    }
    console.log(`The database matches the chain after ${k} of ${names.length} migrations${k ? ` (last: ${names[k - 1]})` : ''}.`);
    report.matchesAfter = k;

    // 3. SQL objects the chain up to k creates.
    const toRecord = names.slice(0, k).filter((n) => !recorded.has(n));
    const toApply = names.slice(k);
    await verifyDefinitions(db);
    if (toRecord.length) {
        const missing = await missingObjects(db, sqlObjects(names, k));
        if (missing.length) fail(`SQL objects that the migrations up to ${names[k - 1]} create are missing: `
            + missing.map((o) => `${o.kind} ${o.name} (from ${o.from})`).join(', ')
            + '. Those migrations were not fully applied; they cannot be recorded as applied.');
    }

    // 4. Data steps that recording will not run.
    const steps = toRecord.map((n) => ({ migration: n, steps: dataSteps(n) })).filter((s) => s.steps.length);
    report.toRecord = toRecord; report.toApply = toApply; report.dataSteps = steps;
    console.log(`Plan: recording ${toRecord.length} migration(s) as applied (already reflected in the database), applying ${toApply.length} migration(s) with migrate deploy.`);
    if (steps.length) {
        console.log(`Data steps in migrations that would be recorded without running (${steps.length} migrations):`);
        for (const s of steps) console.log(`  - ${s.migration}: ${s.steps.join(' | ')}`);
    }
    if (!apply) {
        console.log('Check only: nothing was written. Re-run with --apply to proceed.');
    } else {
        if (steps.length && !dataReviewed)
            fail(`${steps.length} migration(s) to be recorded contain data steps that recording does not run (listed above). `
                + 'Confirm on this data that each step is already reflected, then re-run with --data-steps-reviewed.');

        // 5. Record, deploy, verify.
        if (diffAgainstPrefix(names, k, TARGET, SHADOW).code !== 0) fail('the database changed during the check; run again.');
        await verifyDefinitions(db);
        for (const n of toRecord) {
            targetMayHaveChanged = true;
            const r = prisma(['migrate', 'resolve', '--applied', n, '--schema', SCHEMA], TARGET);
            if (r.code !== 0) { console.error(r.out); throw new Error(`migrate resolve failed at ${n}; the migrations before it are recorded, re-run this script.`); }
        }
        console.log(`Recorded ${toRecord.length} migration(s).`);
        targetMayHaveChanged = true;
        const deploy = prisma(['migrate', 'deploy', '--schema', SCHEMA], TARGET);
        if (deploy.code !== 0) { console.error(deploy.out); throw new Error('migrate deploy failed; see the output above.'); }
        console.log(`Applied ${toApply.length} migration(s).`);
        const final = diffAgainstSchema(TARGET);
        if (final.code !== 0) throw new Error(`after deploy the database differs from schema.prisma:\n${final.out}`);
        if (diffAgainstPrefix(names, names.length, TARGET, SHADOW).code !== 0)
            throw new Error('The deployed database differs from the full migration chain.');
        await verifyDefinitions(db);
        const stillMissing = await missingObjects(db, sqlObjects(names, names.length));
        if (stillMissing.length) throw new Error(`after deploy SQL objects are missing: ${stillMissing.map((o) => o.name).join(', ')}`);
        console.log('Verified: the database equals schema.prisma and has every SQL object of the chain.');
        report.verified = true;
    }
} finally {
    await db.$disconnect();
    report.sqlLineEndingOnly = [...lineEndingObjects];
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}
}

try {
    await main();
} catch (e) {
    if (e instanceof Refused) console.error(`REFUSED: ${e.message}\n${targetMayHaveChanged ? 'The apply phase started; inspect migration history before retrying.' : 'Nothing was written to the target database.'}`);
    else console.error(`FAILED: ${e.message}`);
    process.exitCode = 1;
} finally {
    if (shadowVerified) await resetShadow();
}
