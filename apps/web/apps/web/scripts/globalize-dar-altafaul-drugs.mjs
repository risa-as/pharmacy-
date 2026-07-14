import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const ORG_ID = '930a071a-c933-413c-90dc-1356a8182a2f'; // دار التفاؤل
const BACKUP_PATH = process.argv[2] ?? 'dar-altafaul-drugs-backup.json';

async function main() {
    const drugs = await prisma.globalDrug.findMany({
        where: { organizationId: ORG_ID },
        select: { id: true, barcode: true, tradeName: true },
    });
    writeFileSync(BACKUP_PATH, JSON.stringify({ organizationId: ORG_ID, drugs }, null, 2), 'utf8');
    console.log(`Backed up ${drugs.length} drug ids to ${BACKUP_PATH}`);

    const result = await prisma.globalDrug.updateMany({
        where: { organizationId: ORG_ID },
        data: { organizationId: null },
    });
    console.log(`Converted ${result.count} drugs to global (organizationId = null)`);

    const remaining = await prisma.globalDrug.count({ where: { organizationId: ORG_ID } });
    console.log(`Remaining custom drugs for org: ${remaining}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
