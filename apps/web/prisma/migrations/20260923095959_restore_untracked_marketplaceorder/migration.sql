-- Recreates the pre-state that "20260923100000_session_version_marketplace_idempotency" expects: these tables or columns were created
-- with `prisma db push` and never had a migration. Shapes come from the earliest
-- schema.prisma version containing each table (MarketplaceOrder@b6fc4f9fd0),
-- minus what later migrations add themselves. Applied only on databases built from
-- this migration chain; existing databases already have them (see
-- scripts/baseline-existing-db.mjs).
-- note: FK MarketplaceOrder_listingId_fkey -> MarketplaceListing deferred (target not created yet)

CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
