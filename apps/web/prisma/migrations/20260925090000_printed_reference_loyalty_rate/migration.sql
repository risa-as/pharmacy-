-- Additive, nullable columns only; existing rows are not rewritten.
-- Sale.printedReference: the number an older desktop printed when the server did
--   not keep it (searchable alternative reference, never the official number).
-- Sale.loyaltyRate / DebtPayment.loyaltyRate: loyalty points per dinar in force
--   when the server recorded the row; null for rows recorded before this column.
ALTER TABLE "Sale" ADD COLUMN "printedReference" TEXT;
ALTER TABLE "Sale" ADD COLUMN "loyaltyRate" DOUBLE PRECISION;
ALTER TABLE "DebtPayment" ADD COLUMN "loyaltyRate" DOUBLE PRECISION;

CREATE INDEX "Sale_printedReference_idx" ON "Sale"("printedReference");
