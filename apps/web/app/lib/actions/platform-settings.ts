"use server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

const SINGLETON_ID = "singleton";

export interface PlatformSettingsData {
    bankName: string | null;
    accountHolder: string | null;
    accountNumber: string | null;
    superKeyPhone: string | null;
    zainCashNumber: string | null;
    supportPhone: string | null;
    supportEmail: string | null;
    workingHours: string | null;
    transferNote: string | null;
}

const EMPTY: PlatformSettingsData = {
    bankName: null,
    accountHolder: null,
    accountNumber: null,
    superKeyPhone: null,
    zainCashNumber: null,
    supportPhone: null,
    supportEmail: null,
    workingHours: null,
    transferNote: null,
};

/**
 * Reads the platform settings singleton. Safe for any authenticated user to
 * call (the billing page renders it to tenants). Returns empty defaults when
 * not configured yet so callers can fall back gracefully.
 */
export async function getPlatformSettings(): Promise<PlatformSettingsData> {
    try {
        const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
        if (!row) return EMPTY;
        return {
            bankName: row.bankName,
            accountHolder: row.accountHolder,
            accountNumber: row.accountNumber,
            superKeyPhone: row.superKeyPhone,
            zainCashNumber: row.zainCashNumber,
            supportPhone: row.supportPhone,
            supportEmail: row.supportEmail,
            workingHours: row.workingHours,
            transferNote: row.transferNote,
        };
    } catch {
        return EMPTY;
    }
}

/** Updates the platform settings singleton. SUPER_ADMIN only. */
export async function updatePlatformSettings(
    data: PlatformSettingsData
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
        return { success: false, error: "Unauthorized" };
    }

    // Normalise empty strings to null so the billing page can fall back to defaults.
    const clean = (v: string | null) => {
        const t = (v ?? "").trim();
        return t.length ? t : null;
    };
    const payload = {
        bankName: clean(data.bankName),
        accountHolder: clean(data.accountHolder),
        accountNumber: clean(data.accountNumber),
        superKeyPhone: clean(data.superKeyPhone),
        zainCashNumber: clean(data.zainCashNumber),
        supportPhone: clean(data.supportPhone),
        supportEmail: clean(data.supportEmail),
        workingHours: clean(data.workingHours),
        transferNote: clean(data.transferNote),
    };

    try {
        await prisma.platformSettings.upsert({
            where: { id: SINGLETON_ID },
            create: { id: SINGLETON_ID, ...payload },
            update: payload,
        });
        revalidatePath("/dashboard/admin/payment-info");
        revalidatePath("/dashboard/settings/billing");
        return { success: true };
    } catch (error: any) {
        console.error("[updatePlatformSettings] Error:", error);
        return { success: false, error: "فشل حفظ الإعدادات. حاول مرة أخرى." };
    }
}
