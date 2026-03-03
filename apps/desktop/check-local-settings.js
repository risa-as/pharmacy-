const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const allSettings = await prisma.companySettings.findMany();
    console.log('All Local Company Settings:', JSON.stringify(allSettings, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
