"use server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

const SINGLETON_ID = "singleton";

export interface DownloadSettingsData {
    windowsUrl: string;
    windowsVersion: string;
    windowsSize: string;
    androidUrl: string;
    androidVersion: string;
    androidSize: string;
}

/**
 * Defaults shown when the SUPER_ADMIN hasn't configured the download links yet.
 * These mirror the values originally hardcoded on the landing /download page so
 * nothing breaks before the first save.
 *
 * NOTE: not exported — a "use server" file may only export async functions.
 */
const DOWNLOAD_DEFAULTS: DownloadSettingsData = {
    windowsUrl: "https://github.com/risa-as/pharmacy-/releases/download/v1.0.0/Faramace.POS.Setup.1.0.0.exe",
    windowsVersion: "1.0.0",
    windowsSize: "110 MB",
    androidUrl: "https://github.com/risa-as/pharmacy-/releases/download/v1.0.0/Faramace-mobile.apk",
    androidVersion: "1.0.0",
    androidSize: "110 MB",
};

/**
 * Reads the download settings, falling back to defaults for any blank field.
 * Safe to call unauthenticated (the landing site consumes it via a public API).
 */
export async function getDownloadSettings(): Promise<DownloadSettingsData> {
    try {
        const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
        if (!row) return { ...DOWNLOAD_DEFAULTS };
        const pick = (v: string | null, fallback: string) => {
            const t = (v ?? "").trim();
            return t.length ? t : fallback;
        };
        return {
            windowsUrl: pick(row.downloadWindowsUrl, DOWNLOAD_DEFAULTS.windowsUrl),
            windowsVersion: pick(row.downloadWindowsVersion, DOWNLOAD_DEFAULTS.windowsVersion),
            windowsSize: pick(row.downloadWindowsSize, DOWNLOAD_DEFAULTS.windowsSize),
            androidUrl: pick(row.downloadAndroidUrl, DOWNLOAD_DEFAULTS.androidUrl),
            androidVersion: pick(row.downloadAndroidVersion, DOWNLOAD_DEFAULTS.androidVersion),
            androidSize: pick(row.downloadAndroidSize, DOWNLOAD_DEFAULTS.androidSize),
        };
    } catch {
        return { ...DOWNLOAD_DEFAULTS };
    }
}

/**
 * Updates the download settings. SUPER_ADMIN only. Touches only the download
 * columns, so saving here never clobbers the payment-info fields on the same
 * PlatformSettings singleton row.
 */
export async function updateDownloadSettings(
    data: DownloadSettingsData
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
        return { success: false, error: "Unauthorized" };
    }

    // Store empty strings as null so getDownloadSettings can fall back to defaults.
    const clean = (v: string) => {
        const t = (v ?? "").trim();
        return t.length ? t : null;
    };

    // Reject obviously malformed URLs early (must be http/https).
    const validUrl = (v: string) => {
        const t = (v ?? "").trim();
        if (!t.length) return true; // empty → falls back to default, allowed
        try {
            const u = new URL(t);
            return u.protocol === "http:" || u.protocol === "https:";
        } catch {
            return false;
        }
    };
    if (!validUrl(data.windowsUrl) || !validUrl(data.androidUrl)) {
        return { success: false, error: "رابط التنزيل غير صالح (يجب أن يبدأ بـ http أو https)" };
    }

    const payload = {
        downloadWindowsUrl: clean(data.windowsUrl),
        downloadWindowsVersion: clean(data.windowsVersion),
        downloadWindowsSize: clean(data.windowsSize),
        downloadAndroidUrl: clean(data.androidUrl),
        downloadAndroidVersion: clean(data.androidVersion),
        downloadAndroidSize: clean(data.androidSize),
    };

    try {
        await prisma.platformSettings.upsert({
            where: { id: SINGLETON_ID },
            create: { id: SINGLETON_ID, ...payload },
            update: payload,
        });
        revalidatePath("/dashboard/admin/payment-info");
        return { success: true };
    } catch (error: any) {
        console.error("[updateDownloadSettings] Error:", error);
        return { success: false, error: "فشل حفظ إعدادات التنزيل. حاول مرة أخرى." };
    }
}
