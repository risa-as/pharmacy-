// /tmp/test-layout-crash.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    try {
        let organizationId: string | undefined = undefined; // What if it's actually null?

        console.log("Testing with organizationId = undefined");
        if (organizationId) {
            const org = await prisma.organization.findUnique({
                where: { id: organizationId },
                select: { isSuspended: true },
            });
            console.log("Undefined test: org:", org);
        }

        // What if user.organizationId is somehow passed as null?
        let nullOrgId: any = null;
        console.log("Testing with organizationId = null");
        if (nullOrgId) {
            const org2 = await prisma.organization.findUnique({
                where: { id: nullOrgId },
                select: { isSuspended: true },
            });
            console.log("Null test: org:", org2);
        }

        // What if organizationId IS passed and is a UUID?
        const orgs = await prisma.organization.findMany({ take: 1 });
        if (orgs.length > 0) {
            console.log("Testing with valid UUID", orgs[0].id);
            const org3 = await prisma.organization.findUnique({
                where: { id: orgs[0].id },
                select: { isSuspended: true },
            });
            console.log("Valid test: org:", org3);
        }

        console.log("ALL TESTS PASSED. NO CRASH.");
    } catch (e) {
        console.error("CRASH OCCURRED:");
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
