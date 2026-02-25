
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const branch = await prisma.branch.findFirst({
        where: { name: { contains: 'الكرادة' } }
    });

    if (branch) {
        console.log(`Found: ${branch.name}`);
        fs.writeFileSync('karada_id.txt', branch.id);
    } else {
        console.log('Branch not found');
    }
}

main();
