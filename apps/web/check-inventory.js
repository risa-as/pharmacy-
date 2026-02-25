
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const inventories = await prisma.inventory.groupBy({
            by: ['branchId'],
            _count: {
                id: true,
            },
        });

        console.log('Inventory Counts per Branch:');
        for (const inv of inventories) {
            console.log("ID_START" + inv.branchId + "ID_END");
            console.log("COUNT:" + inv._count.id);
        }

        if (inventories.length === 0) {
            console.log("No inventory items found in database.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
