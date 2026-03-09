/**
 * clear-patients.ts
 * Deletes all patients and all their related data from the web (PostgreSQL) database.
 * Run with: pnpm tsx apps/web/scripts/clear-patients.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔴 Starting patient data cleanup...\n');

    // 1. PatientAppOrder items & orders
    const deletedAppOrderItems = await prisma.patientAppOrderItem.deleteMany({});
    console.log(`✓ PatientAppOrderItem: ${deletedAppOrderItems.count} deleted`);

    const deletedAppOrders = await prisma.patientAppOrder.deleteMany({});
    console.log(`✓ PatientAppOrder: ${deletedAppOrders.count} deleted`);

    const deletedAppUsers = await prisma.patientAppUser.deleteMany({});
    console.log(`✓ PatientAppUser: ${deletedAppUsers.count} deleted`);

    // 2. Insurance policies
    const deletedPolicies = await prisma.insurancePolicy.deleteMany({});
    console.log(`✓ InsurancePolicy: ${deletedPolicies.count} deleted`);

    // 3. Prescriptions
    const deletedPrescriptionItems = await prisma.prescriptionItem.deleteMany({});
    console.log(`✓ PrescriptionItem: ${deletedPrescriptionItems.count} deleted`);

    const deletedPrescriptions = await prisma.prescription.deleteMany({});
    console.log(`✓ Prescription: ${deletedPrescriptions.count} deleted`);

    // 4. Loyalty
    const deletedLoyaltyTxs = await prisma.loyaltyTransaction.deleteMany({});
    console.log(`✓ LoyaltyTransaction: ${deletedLoyaltyTxs.count} deleted`);

    const deletedLoyaltyAccounts = await prisma.loyaltyAccount.deleteMany({});
    console.log(`✓ LoyaltyAccount: ${deletedLoyaltyAccounts.count} deleted`);

    // 5. Sales linked to patients (debt payments, returns, items, payments, then sales)
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

        // SaleReturn items then returns
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

    // 6. Patients
    const deletedPatients = await prisma.patient.deleteMany({});
    console.log(`✓ Patient: ${deletedPatients.count} deleted`);

    console.log('\n✅ Patient data cleanup complete.');
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
