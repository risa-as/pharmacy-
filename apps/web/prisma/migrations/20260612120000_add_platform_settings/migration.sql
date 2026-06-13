-- Platform-wide settings (singleton row) managed by SUPER_ADMIN — e.g. the
-- bank-transfer details shown to all tenants on the billing page.
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL,
    "bankName" TEXT,
    "accountHolder" TEXT,
    "accountNumber" TEXT,
    "superKeyPhone" TEXT,
    "zainCashNumber" TEXT,
    "supportPhone" TEXT,
    "supportEmail" TEXT,
    "workingHours" TEXT,
    "transferNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
