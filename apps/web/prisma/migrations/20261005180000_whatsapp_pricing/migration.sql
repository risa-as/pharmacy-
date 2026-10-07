CREATE TABLE "public"."WaPricingPolicy" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaPricingPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WaPricingPolicy_singleton" CHECK ("id" = 'singleton'),
    CONSTRAINT "WaPricingPolicy_revision_positive" CHECK ("revision" > 0)
);
ALTER TABLE "public"."WaCampaign" ADD COLUMN "priceQuote" JSONB;
