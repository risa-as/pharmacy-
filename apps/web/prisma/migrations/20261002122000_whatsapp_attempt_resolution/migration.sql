ALTER TABLE "public"."WaCampaignAttempt" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "public"."WaCampaignAttempt" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECORDED';
