const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.companySettings.findMany();
    console.log('--- WEB DB CONTENT ---');
    console.log(JSON.stringify(settings, null, 2));
    console.log('----------------------');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
