// electron-builder beforePack hook: generate a schema-only database, never copy local.db.
const { mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function prepareReleaseSeed() {
    const root = path.resolve(__dirname, '..');
    const directory = path.join(root, 'release-seed');
    mkdirSync(directory, { recursive: true });
    // Generate into a new file each time. Only the validated empty DB is published.
    const temporary = path.join(directory, `empty-${require('node:crypto').randomUUID()}.db`);
    const sql = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script'], { encoding: 'utf8', windowsHide: true });
    const { PrismaClient } = require(path.join(root, 'node_modules/.prisma/desktop-client'));
    const client = new PrismaClient({ datasources: { db: { url: `file:${temporary.replaceAll('\\', '/')}` } } });
    try {
        // Prisma-generated SQLite schema consists only of DDL statements.
        for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) await client.$executeRawUnsafe(statement);
        const tables = await client.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        if (!tables.length) throw new Error('Release seed has no schema.');
        for (const { name } of tables) {
            const rows = await client.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`);
            if (Number(rows[0].n) !== 0) throw new Error(`Release seed contains data in ${name}`);
        }
        console.log(`[release] Verified empty schema: ${tables.length} tables, zero customer records.`);
    } finally { await client.$disconnect(); }
    const fs = require('node:fs');
    const destination = path.join(directory, 'local.db');
    // The destination is exclusively a generated release artifact, never the development DB.
    if (existsSync(destination)) fs.unlinkSync(destination);
    fs.renameSync(temporary, destination);
};
if (require.main === module) module.exports().catch((error) => { console.error(error); process.exitCode = 1; });
