-- Additive, nullable: the discount value of one redeemed loyalty point in force
-- when the server recorded the sale; null for sales recorded before this column.
ALTER TABLE "Sale" ADD COLUMN "loyaltyRedemptionValue" DOUBLE PRECISION;
