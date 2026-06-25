-- Download page settings on the PlatformSettings singleton. Managed by
-- SUPER_ADMIN and served to the separate landing site (www.faramace.com/download)
-- via /api/public/download-info. Nullable so the landing falls back to defaults.
ALTER TABLE "PlatformSettings" ADD COLUMN "downloadWindowsUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "downloadWindowsVersion" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "downloadWindowsSize" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "downloadAndroidUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "downloadAndroidVersion" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "downloadAndroidSize" TEXT;
