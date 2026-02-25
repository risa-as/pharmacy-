const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function main() {
    console.log("Connecting to DB...");
    const count = await prisma.companySettings.count();
    console.log(`Current Settings Count: ${count}`);

    if (count === 0) {
        console.log("Seeding Settings...");
        const settings = await prisma.companySettings.create({
            data: {
                id: "6eb7c9de-a494-4c4f-83a7-05a9a43419a4", // Use the ID seen in local logs to match if helpful, or new one. 
                // Actually, let's use a fresh one or specific one. 
                // The desktop has '6eb7c9de-a494-4c4f-83a7-05a9a43419a4'.
                // If we use the SAME ID, upsert works. If we use DIFFERENT, my deleteMany logic works.
                // Let's use the SAME ID so we are consistent if I revert the deleteMany logic.
                // But wait, I changed sync.ts to deleteMany. So ID doesn't matter.
                // I will let it auto-generate or use fixed.
                name: "صيدلية دار الرحمة",
                address: "دورة-ابو طيارة",
                phone: "07724277164",
                currency: "IQD",
                logoUrl: "https://utfs.io/f/Ionf4ykz8FsUkKhTGyUy541pugITtzGUbECnih8aAjXoSYfc"
            }
        });
        console.log("Created Settings:", JSON.stringify(settings, null, 2));
    } else {
        // If it exists, update it to be correct!
        console.log("Settings exist. Updating to ensure correctness...");
        const first = await prisma.companySettings.findFirst();
        const updated = await prisma.companySettings.update({
            where: { id: first.id },
            data: {
                name: "صيدلية دار الرحمة",
                address: "دورة-ابو طيارة",
                phone: "07724277164",
                logoUrl: "https://utfs.io/f/Ionf4ykz8FsUkKhTGyUy541pugITtzGUbECnih8aAjXoSYfc"
            }
        });
        console.log("Updated Settings:", JSON.stringify(updated, null, 2));
    }

    const finalCount = await prisma.companySettings.count();
    const finalData = await prisma.companySettings.findFirst();
    console.log(`Final Count: ${finalCount}`);
    console.log(`Final Data Name: ${finalData?.name}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
