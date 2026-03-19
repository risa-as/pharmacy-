import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding dummy data...');

  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Get plans
  const freePlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'FREE' } });
  const proPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'PROFESSIONAL' } });

  if (!freePlan || !proPlan) {
    throw new Error("Plans not found. Please run seed-plans.ts first.");
  }

  // 2. Create Super Admin (no branch)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'super@faramace.com' },
    update: {},
    create: {
      email: 'super@faramace.com',
      name: 'Super Admin',
      password: passwordHash,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`Created Super Admin: ${superAdmin.email}`);

  // 3. Create Org 1: صيدلية الشفاء
  const org1 = await prisma.organization.create({
    data: {
      name: 'صيدلية الشفاء',
      planId: proPlan.id,
      maxBranches: 3,
      maxUsers: 10,
      maxDevices: 5,
      branches: {
        create: [
          { name: 'الفرع الرئيسي - الكرادة' },
          { name: 'الفرع الثاني - المنصور' }
        ]
      }
    },
    include: { branches: true }
  });

  const org1Branch1 = org1.branches[0];
  const org1Branch2 = org1.branches[1];

  // Users for Org 1
  await prisma.user.createMany({
    data: [
      { email: 'admin@shifa.com', name: 'مدير النظام', password: passwordHash, role: 'ADMIN', branchId: org1Branch1.id },
      { email: 'ph1@shifa.com', name: 'صيدلاني أحمد', password: passwordHash, role: 'PHARMACIST', branchId: org1Branch1.id },
      { email: 'cashier@shifa.com', name: 'كاشير علي', password: passwordHash, role: 'CASHIER', branchId: org1Branch1.id },
      { email: 'ph2@shifa.com', name: 'صيدلانية سارة', password: passwordHash, role: 'PHARMACIST', branchId: org1Branch2.id },
    ]
  });

  // Licenses for Org 1
  await prisma.deviceLicense.createMany({
    data: [
      { licenseKey: 'SHIFA-MAIN-001', branchId: org1Branch1.id, isActive: true, deviceName: 'جهاز الكاشير الرئيسي' },
      { licenseKey: 'SHIFA-BRANCH2-001', branchId: org1Branch2.id, isActive: true, deviceName: 'كاشير المنصور' }
    ]
  });
  console.log(`Created Org 1: ${org1.name} with 2 branches, 4 users, and 2 licenses.`);

  // 4. Create Org 2: صيدلية الحياة
  const org2 = await prisma.organization.create({
    data: {
      name: 'صيدلية الحياة',
      planId: freePlan.id,
      maxBranches: 1,
      maxUsers: 3,
      maxDevices: 1,
      branches: {
        create: [
          { name: 'الفرع الرئيسي' }
        ]
      }
    },
    include: { branches: true }
  });

  const org2Branch = org2.branches[0];

  // Users for Org 2
  await prisma.user.createMany({
    data: [
      { email: 'admin@hayat.com', name: 'مدير صيدلية الحياة', password: passwordHash, role: 'ADMIN', branchId: org2Branch.id },
      { email: 'ph@hayat.com', name: 'صيدلاني محمد', password: passwordHash, role: 'PHARMACIST', branchId: org2Branch.id },
    ]
  });

  // License for Org 2
  await prisma.deviceLicense.create({
    data: { licenseKey: 'HAYAT-001', branchId: org2Branch.id, isActive: true, deviceName: 'جهاز الاستقبال' }
  });
  console.log(`Created Org 2: ${org2.name} with 1 branch, 2 users, and 1 license.`);

  console.log('\n--- Test Accounts Summary ---');
  console.log('All passwords are: 123456');
  console.log('1. Super Admin: super@faramace.com');
  console.log('2. Org 1 Admin: admin@shifa.com (Plan: PRO, 2 Branches)');
  console.log('3. Org 1 Pharmacist: ph1@shifa.com');
  console.log('4. Org 1 Cashier: cashier@shifa.com');
  console.log('5. Org 2 Admin: admin@hayat.com (Plan: FREE, 1 Branch)');
  console.log('6. Org 2 Pharmacist: ph@hayat.com');
  
  console.log('\n--- Licenses Summary ---');
  console.log('Org 1: SHIFA-MAIN-001, SHIFA-BRANCH2-001');
  console.log('Org 2: HAYAT-001');
  
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
