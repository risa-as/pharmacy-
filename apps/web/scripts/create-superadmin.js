const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const hash = bcrypt.hashSync('123456', 10);

    const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { password: hash } });
        console.log('Updated password for existing SUPER_ADMIN:', existing.email);
        return;
    }

    const user = await prisma.user.create({
        data: {
            email: 'admin@faramace.com',
            name: 'Super Admin',
            password: hash,
            role: 'SUPER_ADMIN',
        },
    });
    console.log('Created:', user.email, '| role:', user.role);
}

main()
    .catch(console.error)
    .finally(function() { return prisma.$disconnect(); });
