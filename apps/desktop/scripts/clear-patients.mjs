/**
 * clear-patients.mjs
 * Deletes all patients and related data from the desktop SQLite database.
 * Run with: node apps/desktop/scripts/clear-patients.mjs
 */

import { PrismaClient } from '../node_modules/.prisma/desktop-client/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../prisma/local.db');

const prisma = new PrismaClient({
    datasources: {
        db: { url: `file:${dbPath}` },
    },
});

async function main() {
    console.log(`🔴 Starting desktop patient data cleanup...`);
    console.log(`   DB: ${dbPath}\n`);

    // 1. Loyalty
    const deletedLoyaltyTxs = await prisma.loyaltyTransaction.deleteMany({});
    console.log(`✓ LoyaltyTransaction: ${deletedLoyaltyTxs.count} deleted`);

    const deletedLoyaltyAccounts = await prisma.loyaltyAccount.deleteMany({});
    console.log(`✓ LoyaltyAccount: ${deletedLoyaltyAccounts.count} deleted`);

    // 2. Sales linked to patients
    const patientSaleIds = (
        await prisma.sale.findMany({
            where: { patientId: { not: null } },
            select: { id: true },
        })
    ).map((s) => s.id);

    console.log(`\n  Found ${patientSaleIds.length} patient-linked sales`);

    if (patientSaleIds.length > 0) {
        const deletedDebtPayments = await prisma.debtPayment.deleteMany({
            where: { saleId: { in: patientSaleIds } },
        });
        console.log(`✓ DebtPayment: ${deletedDebtPayments.count} deleted`);

        const returnIds = (
            await prisma.saleReturn.findMany({
                where: { saleId: { in: patientSaleIds } },
                select: { id: true },
            })
        ).map((r) => r.id);

        if (returnIds.length > 0) {
            const deletedReturnItems = await prisma.saleReturnItem.deleteMany({
                where: { saleReturnId: { in: returnIds } },
            });
            console.log(`✓ SaleReturnItem: ${deletedReturnItems.count} deleted`);
        }

        const deletedReturns = await prisma.saleReturn.deleteMany({
            where: { saleId: { in: patientSaleIds } },
        });
        console.log(`✓ SaleReturn: ${deletedReturns.count} deleted`);

        const deletedSaleItems = await prisma.saleItem.deleteMany({
            where: { saleId: { in: patientSaleIds } },
        });
        console.log(`✓ SaleItem: ${deletedSaleItems.count} deleted`);

        const deletedPayments = await prisma.payment.deleteMany({
            where: { saleId: { in: patientSaleIds } },
        });
        console.log(`✓ Payment: ${deletedPayments.count} deleted`);

        const deletedSales = await prisma.sale.deleteMany({
            where: { id: { in: patientSaleIds } },
        });
        console.log(`✓ Sale (patient-linked): ${deletedSales.count} deleted`);
    }

    // 3. Patients
    const deletedPatients = await prisma.patient.deleteMany({});
    console.log(`✓ Patient: ${deletedPatients.count} deleted`);

    console.log('\n✅ Desktop patient data cleanup complete.');
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
