/**
 * cleanup-data.ts
 * Deletes ALL operational data while preserving:
 *   Organization, Branch, User, SubscriptionPlan, PaymentTransaction, DeviceLicense
 *
 * Run: npx tsx prisma/cleanup-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Starting data cleanup...\n');

    await prisma.$transaction(async (tx) => {

        // ── 1. Deepest children first ─────────────────────────────────────────

        const stocktakeItems    = await tx.stocktakeItem.deleteMany();
        console.log(`  ✓ StocktakeItem       — ${stocktakeItems.count}`);

        const saleReturnItems   = await tx.saleReturnItem.deleteMany();
        console.log(`  ✓ SaleReturnItem      — ${saleReturnItems.count}`);

        const saleItems         = await tx.saleItem.deleteMany();
        console.log(`  ✓ SaleItem            — ${saleItems.count}`);

        const prescriptionItems = await tx.prescriptionItem.deleteMany();
        console.log(`  ✓ PrescriptionItem    — ${prescriptionItems.count}`);

        const loyaltyTxs        = await tx.loyaltyTransaction.deleteMany();
        console.log(`  ✓ LoyaltyTransaction  — ${loyaltyTxs.count}`);

        const debtPayments      = await tx.debtPayment.deleteMany();
        console.log(`  ✓ DebtPayment         — ${debtPayments.count}`);

        const payments          = await tx.payment.deleteMany();
        console.log(`  ✓ Payment             — ${payments.count}`);

        const transferItems     = await tx.transferItem.deleteMany();
        console.log(`  ✓ TransferItem        — ${transferItems.count}`);

        const warehouseItems    = await tx.warehouseOrderItem.deleteMany();
        console.log(`  ✓ WarehouseOrderItem  — ${warehouseItems.count}`);

        const patientAppItems   = await tx.patientAppOrderItem.deleteMany();
        console.log(`  ✓ PatientAppOrderItem — ${patientAppItems.count}`);

        const forecasts         = await tx.demandForecast.deleteMany();
        console.log(`  ✓ DemandForecast      — ${forecasts.count}`);

        const notifications     = await tx.notification.deleteMany();
        console.log(`  ✓ Notification        — ${notifications.count}`);

        const mobileSessions    = await tx.mobileSession.deleteMany();
        console.log(`  ✓ MobileSession       — ${mobileSessions.count}`);

        const auditLogs         = await tx.auditLog.deleteMany();
        console.log(`  ✓ AuditLog            — ${auditLogs.count}`);

        const syncLogs          = await tx.syncActionLog.deleteMany();
        console.log(`  ✓ SyncActionLog       — ${syncLogs.count}`);

        const backups           = await tx.backup.deleteMany();
        console.log(`  ✓ Backup              — ${backups.count}`);

        const drugInteractions  = await tx.drugInteraction.deleteMany();
        console.log(`  ✓ DrugInteraction     — ${drugInteractions.count}`);

        const whatsappTemplates = await tx.whatsAppTemplate.deleteMany();
        console.log(`  ✓ WhatsAppTemplate    — ${whatsappTemplates.count}`);

        const discounts         = await tx.discount.deleteMany();
        console.log(`  ✓ Discount            — ${discounts.count}`);

        const companySettings   = await tx.companySettings.deleteMany();
        console.log(`  ✓ CompanySettings     — ${companySettings.count}`);

        const insurancePolicies = await tx.insurancePolicy.deleteMany();
        console.log(`  ✓ InsurancePolicy     — ${insurancePolicies.count}`);

        // ── 2. Mid-level records ──────────────────────────────────────────────

        const saleReturns       = await tx.saleReturn.deleteMany();
        console.log(`  ✓ SaleReturn          — ${saleReturns.count}`);

        const stocktakes        = await tx.stocktake.deleteMany();
        console.log(`  ✓ Stocktake           — ${stocktakes.count}`);

        const prescriptions     = await tx.prescription.deleteMany();
        console.log(`  ✓ Prescription        — ${prescriptions.count}`);

        const loyaltyAccounts   = await tx.loyaltyAccount.deleteMany();
        console.log(`  ✓ LoyaltyAccount      — ${loyaltyAccounts.count}`);

        const patientAppOrders  = await tx.patientAppOrder.deleteMany();
        console.log(`  ✓ PatientAppOrder     — ${patientAppOrders.count}`);

        const patientAppUsers   = await tx.patientAppUser.deleteMany();
        console.log(`  ✓ PatientAppUser      — ${patientAppUsers.count}`);

        const transfers         = await tx.transfer.deleteMany();
        console.log(`  ✓ Transfer            — ${transfers.count}`);

        const warehouseOrders   = await tx.warehouseOrder.deleteMany();
        console.log(`  ✓ WarehouseOrder      — ${warehouseOrders.count}`);

        const warehouses        = await tx.warehouse.deleteMany();
        console.log(`  ✓ Warehouse           — ${warehouses.count}`);

        const marketplaceOrders = await tx.marketplaceOrder.deleteMany();
        console.log(`  ✓ MarketplaceOrder    — ${marketplaceOrders.count}`);

        const listings          = await tx.marketplaceListing.deleteMany();
        console.log(`  ✓ MarketplaceListing  — ${listings.count}`);

        const sales             = await tx.sale.deleteMany();
        console.log(`  ✓ Sale                — ${sales.count}`);

        const purchaseItems     = await tx.purchaseItem.deleteMany();
        console.log(`  ✓ PurchaseItem        — ${purchaseItems.count}`);

        const purchases         = await tx.purchase.deleteMany();
        console.log(`  ✓ Purchase            — ${purchases.count}`);

        const supplierPayments  = await tx.supplierPayment.deleteMany();
        console.log(`  ✓ SupplierPayment     — ${supplierPayments.count}`);

        const batches           = await tx.batch.deleteMany();
        console.log(`  ✓ Batch               — ${batches.count}`);

        const inventories       = await tx.inventory.deleteMany();
        console.log(`  ✓ Inventory           — ${inventories.count}`);

        const suppliers         = await tx.supplier.deleteMany();
        console.log(`  ✓ Supplier            — ${suppliers.count}`);

        const patients          = await tx.patient.deleteMany();
        console.log(`  ✓ Patient             — ${patients.count}`);

        const insuranceCompanies = await tx.insuranceCompany.deleteMany();
        console.log(`  ✓ InsuranceCompany    — ${insuranceCompanies.count}`);

        const expenses          = await tx.expense.deleteMany();
        console.log(`  ✓ Expense             — ${expenses.count}`);

        const shifts            = await tx.shift.deleteMany();
        console.log(`  ✓ Shift               — ${shifts.count}`);

        const transactions      = await tx.transaction.deleteMany();
        console.log(`  ✓ Transaction         — ${transactions.count}`);

        const safes             = await tx.safe.deleteMany();
        console.log(`  ✓ Safe                — ${safes.count}`);

        const drugs             = await tx.globalDrug.deleteMany();
        console.log(`  ✓ GlobalDrug          — ${drugs.count}`);

        console.log('\n✅ Cleanup complete.\n');
        console.log('📌 Preserved (untouched):');
        console.log('   • Organization');
        console.log('   • Branch');
        console.log('   • User');
        console.log('   • SubscriptionPlan');
        console.log('   • PaymentTransaction');
        console.log('   • DeviceLicense');
    }, { timeout: 60000 });
}

main()
    .catch((e) => {
        console.error('\n❌ Cleanup failed:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
