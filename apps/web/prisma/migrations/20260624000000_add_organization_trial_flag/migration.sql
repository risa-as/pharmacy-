-- AddColumn isTrial to Organization
-- Marks an organization as being on a free trial. The trial end date reuses
-- the existing `subscriptionEndsAt` column, so all subscription enforcement
-- (login, sync, desktop offline token, dashboard overlay) applies unchanged.
-- The flag is cleared on the first paid renewal (manual or Zain Cash).
ALTER TABLE "Organization" ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false;
