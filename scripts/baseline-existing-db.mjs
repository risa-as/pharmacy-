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
//  1. _prisma_migrations: no failed/rolled-back rows, no unknown names, checksums equal
//     to the local files.
//  2. Finds the point k of the chain the database is exactly equal to, with
//     `prisma migrate diff` (the chain after k migrations, replayed on the shadow
//     database, against the target): if the history is an exact prefix, k is its
//     length; otherwise the largest k that matches. No match → refuse.
//  3. SQL objects the first k migrations create (functions, triggers, sequences),
//     which migrate diff cannot see, must all exist.
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
    SCHEMA, checksum, client, dataSteps, diffAgainstPrefix, diffAgainstSchema, isEmpty, migrationNames,
    missingObjects, postgresUrl, prisma, sameDatabase, sqlObjects,
} from './migration-chain.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dataReviewed = args.includes('--data-steps-reviewed');
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
class Refused extends Error {}
const fail = (message) => { throw new Refused(message); };
let SHADOW = null, shadowVerified = false;
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
    const broken = rows.filter((r) => !r.finished_at || r.rolled_back_at);
    if (broken.length) fail(`unfinished or rolled-back migrations in _prisma_migrations: ${broken.map((r) => r.migration_name).join(', ')}. Resolve them first.`);
    const unknown = rows.filter((r) => !names.includes(r.migration_name));
    if (unknown.length) fail(`the database records migrations that do not exist here: ${unknown.map((r) => r.migration_name).join(', ')}.`);
    const edited = rows.filter((r) => r.checksum !== checksum(r.migration_name));
    if (edited.length) fail(`recorded checksum differs from the local file for: ${edited.map((r) => `${r.migration_name} (checksum)`).join(', ')}. A migration was edited after it was applied.`);
    const recorded = new Set(rows.map((r) => r.migration_name));
    const lastRecorded = Math.max(-1, ...[...recorded].map((n) => names.indexOf(n)));
    report.recorded = recorded.size;

    // 2. Where the database stands in the chain.
    const exactPrefix = recorded.size > 0 && names.slice(0, recorded.size).every((n) => recorded.has(n));
    let k = -1;
    if (exactPrefix && diffAgainstPrefix(names, recorded.size, TARGET, SHADOW).code === 0) {
        k = recorded.size;
    } else {
        for (let count = names.length; count > lastRecorded; count--) {
            const r = diffAgainstPrefix(names, count, TARGET, SHADOW);
            if (r.code === 0) { k = count; break; }
            if (r.code !== 2) fail(`prisma migrate diff failed at ${count} migrations:\n${r.out}`);
        }
    }
    if (k < 0) {
        const diff = diffAgainstPrefix(names, names.length, TARGET, SHADOW, true);
        fail(`the database matches no point of the migration chain that includes its recorded history.\n`
            + `Difference from the full chain (review; do not apply blindly):\n${diff.out.slice(0, 6000)}`);
    }
    console.log(`The database matches the chain after ${k} of ${names.length} migrations${k ? ` (last: ${names[k - 1]})` : ''}.`);
    report.matchesAfter = k;

    // 3. SQL objects the chain up to k creates.
    const toRecord = names.slice(0, k).filter((n) => !recorded.has(n));
    const toApply = names.slice(k);
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
        for (const n of toRecord) {
            const r = prisma(['migrate', 'resolve', '--applied', n, '--schema', SCHEMA], TARGET);
            if (r.code !== 0) { console.error(r.out); throw new Error(`migrate resolve failed at ${n}; the migrations before it are recorded, re-run this script.`); }
        }
        console.log(`Recorded ${toRecord.length} migration(s).`);
        const deploy = prisma(['migrate', 'deploy', '--schema', SCHEMA], TARGET);
        if (deploy.code !== 0) { console.error(deploy.out); throw new Error('migrate deploy failed; see the output above.'); }
        console.log(`Applied ${toApply.length} migration(s).`);
        const final = diffAgainstSchema(TARGET);
        if (final.code !== 0) throw new Error(`after deploy the database differs from schema.prisma:\n${final.out}`);
        const stillMissing = await missingObjects(db, sqlObjects(names, names.length));
        if (stillMissing.length) throw new Error(`after deploy SQL objects are missing: ${stillMissing.map((o) => o.name).join(', ')}`);
        console.log('Verified: the database equals schema.prisma and has every SQL object of the chain.');
        report.verified = true;
    }
} finally {
    await db.$disconnect();
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}
}

try {
    await main();
} catch (e) {
    if (e instanceof Refused) console.error(`REFUSED: ${e.message}\nNothing was written to the target database.`);
    else console.error(`FAILED: ${e.message}`);
    process.exitCode = 1;
} finally {
    if (shadowVerified) await resetShadow();
}
