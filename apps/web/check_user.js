const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userId = 'bd2ede8a-f1a1-4127-889b-e2b0816d102e';
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });
    console.log('User found:', user);

    const sale = await prisma.sale.findFirst({
        where: { userId: userId },
        include: { user: true }
    });
    console.log('Sale with user relation:', sale?.user);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
