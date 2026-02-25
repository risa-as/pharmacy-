const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const existing = await prisma.companySettings.findFirst();
    if (existing) {
        console.log("Settings already exist:", existing);
        return;
    }

    console.log("Seeding verified Company Settings...");
    // Using the ID from my previous check-settings.js output just in case user wants to keep that ID, 
    // or I can generate a new one. The previous check-settings.js output (Step 450) showed an ID c83a... 
    // But now it's gone? Or maybe I was looking at a DIFFERENT DB in Step 450?
    // If Step 450 found data, but Step 641 found NONE, then Step 450 was looking at a DIFFERENT DB.
    // The DB in .env is the one Next.js uses. It is empty.
    // So I should seed it.

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
