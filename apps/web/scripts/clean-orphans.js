const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanOrphanSaleItems() {
    console.log("Checking for orphan SaleItems...");

    const saleItems = await prisma.saleItem.findMany();
    let orphanCount = 0;

    for (const item of saleItems) {
        const drug = await prisma.globalDrug.findUnique({
            where: { id: item.drugId }
        });

        if (!drug) {
            console.log(`Orphan SaleItem found: ${item.id} (drugId: ${item.drugId})`);
            await prisma.saleItem.delete({
                where: { id: item.id }
            });
            orphanCount++;
        }
    }

    console.log(`Cleanup complete. Removed ${orphanCount} orphan SaleItems.`);
}

cleanOrphanSaleItems()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
