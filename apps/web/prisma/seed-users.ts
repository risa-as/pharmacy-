import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 إنشاء بيانات المستخدمين...\n');

    const password = await bcrypt.hash('123456', 10);

    // ==================== Super Admin (لا يحتاج org أو branch) ====================
    const superAdmin = await prisma.user.upsert({
        where: { email: 'superadmin@faramace.com' },
        update: { password },
        create: {
            name: 'سوبر ادمن',
            email: 'superadmin@faramace.com',
            password,
            role: 'SUPER_ADMIN',
        },
    });
    console.log('✅ Super Admin:', superAdmin.email);

    // ==================== Organization + Branches (للمستخدمين الآخرين) ====================
    const org = await prisma.organization.upsert({
        where: { id: 'seed-org-1' },
        update: {},
        create: {
            id: 'seed-org-1',
            name: 'صيدلية فاراماس',
        },
    });

    const branch = await prisma.branch.upsert({
        where: { id: 'seed-branch-1' },
        update: {},
        create: {
            id: 'seed-branch-1',
            name: 'الفرع الرئيسي',
            organizationId: org.id,
        },
    });

    // ==================== Admin ====================
    const admin = await prisma.user.upsert({
        where: { email: 'admin@faramace.com' },
        update: { password },
        create: {
            name: 'مدير النظام',
            email: 'admin@faramace.com',
            password,
            role: 'ADMIN',
            branchId: branch.id,
        },
    });
    console.log('✅ Admin:', admin.email);

    // ==================== Pharmacist ====================
    const pharmacist = await prisma.user.upsert({
        where: { email: 'pharmacist@faramace.com' },
        update: { password },
        create: {
            name: 'الصيدلاني',
            email: 'pharmacist@faramace.com',
            password,
            role: 'PHARMACIST',
            branchId: branch.id,
        },
    });
    console.log('✅ Pharmacist:', pharmacist.email);

    // ==================== Cashier ====================
    const cashier = await prisma.user.upsert({
        where: { email: 'cashier@faramace.com' },
        update: { password },
        create: {
            name: 'الكاشير',
            email: 'cashier@faramace.com',
            password,
            role: 'CASHIER',
            branchId: branch.id,
        },
    });
    console.log('✅ Cashier:', cashier.email);

    console.log('\n✅ تم إنشاء المستخدمين بنجاح!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  كلمة المرور لجميع الحسابات: 123456');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  superadmin@faramace.com  →  SUPER_ADMIN');
    console.log('  admin@faramace.com       →  ADMIN');
    console.log('  pharmacist@faramace.com  →  PHARMACIST');
    console.log('  cashier@faramace.com     →  CASHIER');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
