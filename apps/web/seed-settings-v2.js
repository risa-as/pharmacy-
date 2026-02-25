const { PrismaClient } = require('@prisma/client');
const path = require('path');
// Manually load .env from current directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function main() {
    const existing = await prisma.companySettings.findFirst();
    if (existing) {
        console.log("Settings already exist:", existing);
        return;
    }

    console.log("Seeding verified Company Settings...");

    const settings = await prisma.companySettings.create({
        data: {
            name: "صيدلية دار الرحمة",
            phone: "07724277164",
            address: "دورة-ابو طيارة",
            logoUrl: "https://utfs.io/f/Ionf4ykz8FsUkKhTGyUy541pugITtzGUbECnih8aAjXoSYfc",
            currency: "IQD"
        }
    });
    console.log("Created:", settings);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
