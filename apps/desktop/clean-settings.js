const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Delete all settings to ensure we start clean
    const deleted = await prisma.companySettings.deleteMany({});
    console.log(`Deleted ${deleted.count} existing company settings records.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
