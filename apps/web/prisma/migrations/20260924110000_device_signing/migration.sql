CREATE TABLE "DeviceSigningKey" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "licenseId" TEXT NOT NULL UNIQUE REFERENCES "DeviceLicense"("id") ON DELETE CASCADE,
 "publicKey" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "approvedAt" TIMESTAMP(3),
 "approvedBy" TEXT
);
CREATE TABLE "DeviceSigningNonce" (
 "keyId" TEXT NOT NULL REFERENCES "DeviceSigningKey"("id") ON DELETE CASCADE,
 "nonce" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("keyId", "nonce")
);
CREATE INDEX "DeviceSigningNonce_expiresAt_idx" ON "DeviceSigningNonce"("expiresAt");
