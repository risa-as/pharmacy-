import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany({
        select: { id: true, name: true }
    });
    console.log(branches);
}
main().finally(() => prisma.$disconnect());
