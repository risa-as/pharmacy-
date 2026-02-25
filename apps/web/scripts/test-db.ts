
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- DB DIAGNOSTIC ---');

        const orgCount = await prisma.organization.count();
        console.log(`Org Count: ${orgCount}`);

        const branchesCount = await prisma.branch.count();
        console.log(`Branch Count: ${branchesCount}`);

        const orgs = await prisma.organization.findMany();
        console.log(`Orgs found: ${orgs.length}`);
        console.log(JSON.stringify(orgs, null, 2));

        const branches = await prisma.branch.findMany({
            include: { organization: true }
        });
        console.log(`Branches found: ${branches.length}`);
        console.log(JSON.stringify(branches, null, 2));

        const drugCount = await prisma.globalDrug.count();
        console.log(`Global Drugs: ${drugCount}`);

        const targetBranch = await prisma.branch.findUnique({
            where: { id: 'e9e8f4c2-9547-4180-873b-555555555555' }
        });
        console.log('Target Sync Branch Exists:', !!targetBranch);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
