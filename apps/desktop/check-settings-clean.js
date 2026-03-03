const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.companySettings.findFirst();
    console.log('--- LOCAL DB SETTINGS ---');
    if (settings) {
        console.log(`Name: ${settings.name}`);
        console.log(`Address: ${settings.address}`);
        console.log(`ID: ${settings.id}`);
    } else {
        console.log('No settings found in local DB.');
    }
    console.log('-------------------------');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
