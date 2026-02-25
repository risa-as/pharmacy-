
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const branches = await prisma.branch.findFirst({
            where: { name: { contains: 'الرئيسي' } },
            select: { id: true }
        });
        console.log('Branches:', JSON.stringify(branches));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();

export { };
