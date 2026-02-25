
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'raad@faramace.com';
    const user = await prisma.user.findFirst({
        where: { email: email },
        include: { branch: true }
    });

    if (user) {
        console.log(`User: ${user.name} (${user.email})`);
        console.log("USER_BRANCH_START" + user.branchId + "USER_BRANCH_END");
        console.log(`Branch Name: ${user.branch ? user.branch.name : 'None'}`);
    } else {
        console.log('User not found');
    }

    const suspiciousId = 'e9e8f4c2-9547-4180-873b-555555555555';
    const suspiciousBranch = await prisma.branch.findUnique({
        where: { id: suspiciousId }
    });

    if (suspiciousBranch) {
        console.log(`Suspicious Branch Found: ${suspiciousBranch.name}`);
    } else {
        console.log(`Suspicious Branch NOT found in DB: ${suspiciousId}`);
    }
}

main();
