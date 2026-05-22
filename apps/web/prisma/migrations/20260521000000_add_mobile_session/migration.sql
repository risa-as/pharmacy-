-- CreateTable
CREATE TABLE IF NOT EXISTS "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MobileSession_deviceToken_key" ON "MobileSession"("deviceToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MobileSession_organizationId_isActive_idx" ON "MobileSession"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MobileSession_userId_idx" ON "MobileSession"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MobileSession_lastSeenAt_idx" ON "MobileSession"("lastSeenAt");
