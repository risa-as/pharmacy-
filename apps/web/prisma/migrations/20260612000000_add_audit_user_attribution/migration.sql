-- Attribute desktop-synced returns and debt payments to the cashier who made
-- them, so the audit log shows a real user instead of a generic "Desktop Sync".
-- Nullable so existing rows are unaffected.
ALTER TABLE "SaleReturn" ADD COLUMN "userId" TEXT;
ALTER TABLE "DebtPayment" ADD COLUMN "userId" TEXT;
