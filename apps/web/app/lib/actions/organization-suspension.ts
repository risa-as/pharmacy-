"use server";

import { prisma } from "@/app/lib/prisma";
import { suspendOrgLicenses, reactivateOrgLicenses } from "@/app/lib/actions/license";
import { revalidatePath } from "next/cache";

/**
 * Suspends an organisation:
 * 1. Sets isSuspended = true, suspendedAt = now on the Organization record.
 * 2. Cascades to all DeviceLicenses via suspendOrgLicenses().
 */
export async function suspendOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.organization.update({
            where: { id: orgId },
            data: {
                isSuspended: true,
                suspendedAt: new Date(),
            },
        });

        await suspendOrgLicenses(orgId);

        revalidatePath("/dashboard/tenants");
        revalidatePath("/dashboard/admin/licenses");
        return { success: true };
    } catch (error: any) {
        console.error("[suspendOrganization] Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Reactivates a suspended organisation:
 * 1. Clears isSuspended and suspendedAt on the Organization record.
 * 2. Restores only the suspension-killed licenses via reactivateOrgLicenses().
 */
export async function reactivateOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.organization.update({
            where: { id: orgId },
            data: {
                isSuspended: false,
                suspendedAt: null,
            },
        });

        await reactivateOrgLicenses(orgId);

        revalidatePath("/dashboard/tenants");
        revalidatePath("/dashboard/admin/licenses");
        return { success: true };
    } catch (error: any) {
        console.error("[reactivateOrganization] Error:", error);
        return { success: false, error: error.message };
    }
}
