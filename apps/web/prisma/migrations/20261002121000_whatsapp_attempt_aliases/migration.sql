CREATE TABLE "public"."WaCampaignAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "previewHash" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaCampaignAttempt_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."WaCampaignAttempt" ADD CONSTRAINT "WaCampaignAttempt_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "public"."WaCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
