import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding subscription plans...');

    const plans = [
        // ─── الخطة الأساسية ────────────────────────────────────────────────
        {
            name: 'أساسي',
            price: 30000,
            maxBranches: 1,
            maxUsers: 5,
            maxDevices: 1,
            maxMobileUsers: 1,
            isActive: true,
            isPopular: false,
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
        // ─── الخطة الاحترافية (الأكثر طلباً) ──────────────────────────────
        {
            name: 'احترافي',
            price: 55000,
            maxBranches: 3,
            maxUsers: 10,
            maxDevices: 3,
            maxMobileUsers: 3,
            isActive: true,
            isPopular: true,
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
        // ─── خطة المؤسسات (Custom Pricing — تواصل معنا) ───────────────────
        {
            name: 'مؤسسات',
            price: 0,          // 0 = سعر مخصص (تواصل معنا)
            maxBranches: -1,   // -1 = غير محدود
            maxUsers: -1,
            maxDevices: -1,
            maxMobileUsers: -1,
            isActive: true,
            isPopular: false,
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
