import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Explicit opt-in only. Never takes DATABASE_URL/.env as the target.
const url = process.env.NEW_DATABASE_URL;
if (!url) throw new Error('NEW_DATABASE_URL is required and must name a NEW, EMPTY database.');
const parsed = new URL(url);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.pathname.slice(1)) throw new Error('A named PostgreSQL database is required.');
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const baseline = JSON.parse(readFileSync('scripts/database-baseline.json', 'utf8'));
const digest = file => createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (digest('apps/web/prisma/schema.prisma') !== baseline.schemaSha256) throw new Error('Schema changed since baseline review; review and regenerate baseline before bootstrapping.');
const current = readdirSync('apps/web/prisma/migrations', { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
if (JSON.stringify(current) !== JSON.stringify(Object.keys(baseline.migrations).sort())) throw new Error('Migration set changed since baseline review.');
for (const [name, hash] of Object.entries(baseline.migrations)) {
  if (digest(`apps/web/prisma/migrations/${name}/migration.sql`) !== hash) throw new Error(`Historical migration changed: ${name}`);
}
const db = new PrismaClient({ datasources: { db: { url } } });
try {
  const objects = await db.$queryRawUnsafe(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p','v','m','S','f')`);
  const enums = await db.$queryRawUnsafe(`SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typtype='e' AND n.nspname NOT IN ('pg_catalog','information_schema')`);
  if (objects.length || enums.length) throw new Error('Refusing to bootstrap a non-empty database. No schema/data changes made.');
} finally { await db.$disconnect(); }
const run = args => {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', 'web', 'exec', 'prisma', ...args], {
    shell: process.platform === 'win32', stdio: 'inherit', env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error('Baseline initialization failed. Inspect the NEW database; do not retry against existing data.');
};
// Historical SQL assumed tables created outside migrations. Materialize the
// reviewed schema once, then baseline old migrations with Prisma's own command.
run(['db', 'push', '--skip-generate']);
for (const name of current) run(['migrate', 'resolve', '--applied', name]);
run(['migrate', 'deploy']);
run(['migrate', 'status']);
console.log('Empty database initialized and historical migrations baselined.');
