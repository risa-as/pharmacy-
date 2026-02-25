// Script to find and clean duplicate Inventory records
// Run with: npx tsx prisma/cleanup-duplicates.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Looking for duplicate (drugId, branchId) in Inventory...\n");

    // Find duplicates
    const duplicates = await prisma.$queryRaw<
        { drugId: string; branchId: string; count: bigint }[]
    >`
        SELECT "drugId", "branchId", COUNT(*) as count 
        FROM "Inventory" 
        GROUP BY "drugId", "branchId" 
        HAVING COUNT(*) > 1
    `;

    if (duplicates.length === 0) {
        console.log("✅ No duplicates found!");
        return;
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate groups:\n`);

    for (const dup of duplicates) {
        console.log(`  drugId: ${dup.drugId}, branchId: ${dup.branchId} → ${dup.count} records`);

        // Get all records for this combination
        const records = await prisma.inventory.findMany({
            where: { drugId: dup.drugId, branchId: dup.branchId },
            include: { batches: true },
            orderBy: { updatedAt: "desc" },
        });

        // Keep the first one (most recently updated), delete the rest
        const toKeep = records[0];
        const toDelete = records.slice(1);

        console.log(`    ✅ Keeping: id=${toKeep.id} (price=${toKeep.price}, cost=${toKeep.cost}, batches=${toKeep.batches.length})`);

        for (const delRec of toDelete) {
            // Move batches to the keeper if any
            if (delRec.batches.length > 0) {
                console.log(`    📦 Moving ${delRec.batches.length} batches from ${delRec.id} to ${toKeep.id}`);
                await prisma.batch.updateMany({
                    where: { inventoryId: delRec.id },
                    data: { inventoryId: toKeep.id },
                });
            }
            // Delete the duplicate
            await prisma.inventory.delete({ where: { id: delRec.id } });
            console.log(`    🗑️  Deleted duplicate: id=${delRec.id}`);
        }
    }

    console.log("\n✅ Cleanup complete! Now run: npx prisma db push");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
