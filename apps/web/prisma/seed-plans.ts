import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding default subscription plans...');

    const plans = [
        {
            name: 'FREE',
            price: 0,
            maxBranches: 1,
            maxUsers: 3,
            maxDevices: 1,
            maxMobileUsers: 1,
            isActive: true,
            features: {
                advancedReports: false,
                productMovement: false,
                supplierManagement: false,
                granularPermissions: false,
                warehouseManagement: false,
                interBranchTransfers: false,
                marketplace: false,
            },
        },
        {
            name: 'BASIC',
            price: 20000,
            maxBranches: 1,
            maxUsers: 5,
            maxDevices: 1,
            maxMobileUsers: 1,
            isActive: true,
            features: {
                advancedReports: false,
                productMovement: false,
                supplierManagement: false,
                granularPermissions: false,
                warehouseManagement: false,
                interBranchTransfers: false,
                marketplace: false,
            },
        },
        {
            name: 'PROFESSIONAL',
            price: 40000,
            maxBranches: 5,
            maxUsers: 20,
            maxDevices: 3,
            maxMobileUsers: 3,
            isActive: true,
            features: {
                advancedReports: true,
                productMovement: true,
                supplierManagement: true,
                granularPermissions: true,
                warehouseManagement: false,
                interBranchTransfers: false,
                marketplace: false,
            },
        },
        {
            name: 'ENTERPRISE',
            price: 80000,
            maxBranches: -1,
            maxUsers: -1,
            maxDevices: -1,
            maxMobileUsers: -1,
            isActive: true,
            features: {
                advancedReports: true,
                productMovement: true,
                supplierManagement: true,
                granularPermissions: true,
                warehouseManagement: true,
                interBranchTransfers: true,
                marketplace: true,
            },
        },
    ];

    for (const planData of plans) {
        // findFirst then create/update because `name` is not @unique in schema
        const existing = await prisma.subscriptionPlan.findFirst({
            where: { name: planData.name },
        });

        if (existing) {
            await prisma.subscriptionPlan.update({
                where: { id: existing.id },
                data: planData,
            });
            console.log(`Updated plan: ${planData.name}`);
        } else {
            await prisma.subscriptionPlan.create({ data: planData });
            console.log(`Created plan: ${planData.name}`);
        }
    }

    console.log('Seed completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
