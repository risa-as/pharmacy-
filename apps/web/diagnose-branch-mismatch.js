
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'raad@faramace.com';
    const suspiciousId = 'e9e8f4c2-9547-4180-873b-555555555555';

    console.log("--- DIAGNOSIS START ---");

    // 1. Check User
    const user = await prisma.user.findFirst({
        where: { email: email },
        include: { branch: true }
    });

    if (user) {
        console.log(`User: ${user.name}`);
        console.log(`User Branch ID: ${user.branchId}`);
        console.log(`User Branch Name: ${user.branch ? user.branch.name : 'NULL'}`);
    } else {
        console.log('User not found!');
    }

    // 2. Check Suspicious Branch
    const susBranch = await prisma.branch.findUnique({
        where: { id: suspiciousId }
    });
    console.log(`Suspicious Branch (${suspiciousId}): ${susBranch ? susBranch.name : 'NOT FOUND IN DB'}`);

    // 3. Check Karada Branch
    const karada = await prisma.branch.findFirst({
        where: { name: { contains: 'الكرادة' } }
    });
    console.log(`Karada Branch ID: ${karada ? karada.id : 'NOT FOUND'}`);
    console.log(`Karada Branch Name: ${karada ? karada.name : 'NOT FOUND'}`);

    console.log("--- DIAGNOSIS END ---");
}

main();
