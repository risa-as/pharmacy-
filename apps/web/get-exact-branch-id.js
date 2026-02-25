
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    try {
        const branch = await prisma.branch.findFirst({
            where: { name: { contains: "الرئيسي" } }
        });

        if (branch) {
            console.log(`Found Branch: ${branch.name}`);
            fs.writeFileSync('branch_id.txt', branch.id);
        } else {
            console.log("Branch not found");
            // Fallback: list all
            const branches = await prisma.branch.findMany();
            fs.writeFileSync('branch_id.txt', JSON.stringify(branches));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
