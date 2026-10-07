-- Existing connections must be verified for platform billing before sending.
ALTER TABLE "public"."WaConnection"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "state" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "allocationId" TEXT,
  ADD COLUMN "fundingId" TEXT,
  ADD COLUMN "billingVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "disconnectedAt" TIMESTAMPTZ(3),
  ADD COLUMN "contactsSyncState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "historySyncState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "onboardedAt" TIMESTAMPTZ(3);
ALTER TABLE "public"."WaMessage" ADD COLUMN "providerErrorCode" TEXT;
CREATE TABLE "public"."WaWallet" (
  "organizationId" TEXT PRIMARY KEY,
  "availableIqd" BIGINT NOT NULL DEFAULT 0,
  "reservedIqd" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  -- A late authoritative delivery may debit a previously released hold.
  -- Such a debt blocks new reservations; it must not discard a real delivery.
  CONSTRAINT "WaWallet_amounts_check" CHECK ("availableIqd" BETWEEN -9007199254740991 AND 9007199254740991 AND "reservedIqd" BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE "public"."WaWalletEntry" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL,
  kind TEXT NOT NULL,
  "availableDelta" BIGINT NOT NULL,
  "reservedDelta" BIGINT NOT NULL,
  reference TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "WaWalletEntry_organizationId_createdAt_idx" ON "public"."WaWalletEntry" ("organizationId","createdAt");
CREATE UNIQUE INDEX "WaWalletEntry_organizationId_kind_reference_key" ON "public"."WaWalletEntry" ("organizationId",kind,reference);
CREATE TABLE "public"."WaMessageCharge" (
  "messageId" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "amountIqd" BIGINT NOT NULL CHECK ("amountIqd" > 0 AND "amountIqd" <= 9007199254740991),
  "policyRevision" INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','CHARGED','RELEASED')),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE TABLE "public"."WaSignupAttempt" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  revision TEXT,
  "tokenEncrypted" TEXT,
  state TEXT NOT NULL DEFAULT 'STARTED',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE TABLE "public"."WaWebhookEvent" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "phoneId" TEXT NOT NULL,
  "payloadEncrypted" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'QUEUED',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "claimedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "WaWebhookEvent_state_createdAt_idx" ON "public"."WaWebhookEvent" (state,"createdAt");
CREATE TABLE "public"."WaInboxMessage" (
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL,
  source TEXT NOT NULL,
  "contentEncrypted" TEXT NOT NULL,
  "sentAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("organizationId","providerId")
);
CREATE INDEX "WaInboxMessage_organizationId_phone_sentAt_idx" ON "public"."WaInboxMessage" ("organizationId",phone,"sentAt");
