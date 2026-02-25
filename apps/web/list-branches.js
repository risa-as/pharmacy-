const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany();
    console.log('Branches:', branches);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
