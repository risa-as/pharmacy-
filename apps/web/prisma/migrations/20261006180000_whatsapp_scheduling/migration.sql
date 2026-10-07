-- Nullable keeps existing campaigns and older immediate senders unchanged.
ALTER TABLE "public"."WaCampaign"
  ADD COLUMN "scheduledAt" TIMESTAMPTZ(3);
