/**
 * seed-superadmin.ts
 * Creates the SUPER_ADMIN account and seeds all subscription plans.
 *
 * Run: npx tsx prisma/seed-superadmin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedPlans() {
    const plans = [
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
                branchManagement: false,
                branchComparison: false,
                warehouseManagement: false,
                interBranchTransfers: false,
                marketplace: false,
            },
        },
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
                advancedReports: false,
                productMovement: true,
                supplierManagement: true,
                granularPermissions: true,
                branchManagement: true,
                branchComparison: false,
                warehouseManagement: false,
                interBranchTransfers: false,
                marketplace: false,
            },
        },
        {
            name: 'مؤسسات',
            price: 0,
            maxBranches: -1,
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
                branchManagement: true,
                branchComparison: true,
                warehouseManagement: true,
                interBranchTransfers: true,
                marketplace: true,
            },
        },
    ];

    for (const planData of plans) {
        const existing = await prisma.subscriptionPlan.findFirst({ where: { name: planData.name } });
        if (existing) {
            await prisma.subscriptionPlan.update({ where: { id: existing.id }, data: planData });
            console.log(`  ↻ Plan updated:  ${planData.name}`);
        } else {
            await prisma.subscriptionPlan.create({ data: planData });
            console.log(`  ✓ Plan created:  ${planData.name}`);
        }
    }
}

async function seedSuperAdmin() {
    const email = 'superadminrisa@faramace.com';
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        // Update password and ensure role is SUPER_ADMIN
        const hashed = await bcrypt.hash('R$i1999s$a', 10);
        await prisma.user.update({
            where: { email },
            data: { password: hashed, role: 'SUPER_ADMIN', name: 'Super Admin' },
        });
        console.log(`  ↻ SuperAdmin updated: ${email}`);
    } else {
        const hashed = await bcrypt.hash('R$i1999s$a', 10);
        await prisma.user.create({
            data: {
                email,
                name: 'Super Admin',
                role: 'SUPER_ADMIN',
                password: hashed,
            },
        });
        console.log(`  ✓ SuperAdmin created: ${email}`);
    }
}

async function main() {
    console.log('\n🌱 Seeding...\n');

    console.log('📦 Subscription Plans:');
    await seedPlans();

    console.log('\n👤 Super Admin:');
    await seedSuperAdmin();

    console.log('\n✅ Done.\n');
}

main()
    .catch((e) => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
