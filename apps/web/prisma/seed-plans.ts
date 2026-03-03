import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding default subscription plans...');

    // Define the default plans based on legacy Enums and reasonable caps
    const plans = [
        {
            name: 'FREE',
            price: 0,
            maxBranches: 1,
            maxUsers: 3,
            isActive: true,
            features: { description: 'Basic features for small setups.' }
        },
        {
            name: 'BASIC',
            price: 50,
            maxBranches: 3,
            maxUsers: 10,
            isActive: true,
            features: { description: 'Standard tier for growing businesses.' }
        },
        {
            name: 'PROFESSIONAL',
            price: 150,
            maxBranches: 10,
            maxUsers: 50,
            isActive: true,
            features: { description: 'Advanced features for clinics and chains.' }
        }
    ];

    const createdPlans = [];

    for (const planData of plans) {
        const plan = await prisma.subscriptionPlan.create({
            data: planData
        });
        createdPlans.push(plan);
        console.log(`Created plan: ${plan.name} (ID: ${plan.id})`);
    }

    const freePlan = createdPlans.find(p => p.name === 'FREE');

    if (freePlan) {
        console.log(`Assigning FREE plan to existing organizations...`);
        const result = await prisma.organization.updateMany({
            where: {
                planId: null
            },
            data: {
                planId: freePlan.id,
                // We keep native overrides null so they strictly follow the plan defaults unless explicitly overridden later
                maxBranches: null,
                maxUsers: null,
            }
        });
        console.log(`Successfully assigned FREE plan to ${result.count} existing organizations.`);
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
