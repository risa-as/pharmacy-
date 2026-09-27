// Creates a NEW database from the migration chain alone: `prisma migrate deploy`,
// then proves the result equals schema.prisma and has every SQL object the chain
// creates. No `db push`, no `migrate resolve`.
//
//   NEW_DATABASE_URL=… node scripts/bootstrap-empty-db.mjs
//
// Explicit opt-in only: never takes DATABASE_URL/.env as the target, and refuses a
// database that already has tables or types. Existing databases are brought under
// the chain with scripts/baseline-existing-db.mjs instead.
import { client, diffAgainstSchema, isEmpty, migrationNames, missingObjects, postgresUrl, prisma, SCHEMA, sqlObjects } from './migration-chain.mjs';

const url = postgresUrl(process.env.NEW_DATABASE_URL, 'NEW_DATABASE_URL (a NEW, EMPTY database)').toString();
const db = client(url);
try {
    if (!(await isEmpty(db))) throw new Error('Refusing to bootstrap a non-empty database. No schema/data changes made.');
    const deploy = prisma(['migrate', 'deploy', '--schema', SCHEMA], url);
    if (deploy.code !== 0) { console.error(deploy.out); throw new Error('migrate deploy failed on the new database; inspect it, do not retry against existing data.'); }
    const diff = diffAgainstSchema(url);
    if (diff.code !== 0) throw new Error(`The new database differs from schema.prisma:\n${diff.out}`);
    const names = migrationNames();
    const missing = await missingObjects(db, sqlObjects(names, names.length));
    if (missing.length) throw new Error(`SQL objects missing after migrate deploy: ${missing.map((o) => o.name).join(', ')}`);
    console.log(`New database created by migrate deploy (${names.length} migrations); it equals schema.prisma and has every SQL object of the chain.`);
} finally {
    await db.$disconnect();
}
