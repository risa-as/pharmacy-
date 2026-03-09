"use server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Suspends an organisation:
 * 1. Sets isSuspended = true, suspendedAt = now on the Organization record.
 * 2. Cascades to all DeviceLicenses atomically within the same transaction.
 */
export async function suspendOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "SUPER_ADMIN") {
            return { success: false, error: "Unauthorized" };
        }

        const branches = await prisma.branch.findMany({
            where: { organizationId: orgId },
            select: { id: true },
        });
        const branchIds = branches.map((b) => b.id);

        await prisma.$transaction(async (tx) => {
            await tx.organization.update({
                where: { id: orgId },
                data: { isSuspended: true, suspendedAt: new Date() },
            });

            await tx.deviceLicense.updateMany({
                where: {
                    branchId: { in: branchIds },
                    isActive: true,
                    suspendedByOrgSuspension: false,
                },
                data: { isActive: false, suspendedByOrgSuspension: true },
            });
        });

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
 * 2. Restores only the suspension-killed licenses atomically.
 */
export async function reactivateOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "SUPER_ADMIN") {
            return { success: false, error: "Unauthorized" };
        }

        const branches = await prisma.branch.findMany({
            where: { organizationId: orgId },
            select: { id: true },
        });
        const branchIds = branches.map((b) => b.id);

        await prisma.$transaction(async (tx) => {
            await tx.organization.update({
                where: { id: orgId },
                data: { isSuspended: false, suspendedAt: null },
            });

            await tx.deviceLicense.updateMany({
                where: {
                    branchId: { in: branchIds },
                    suspendedByOrgSuspension: true,
                },
                data: { isActive: true, suspendedByOrgSuspension: false },
            });
        });

        revalidatePath("/dashboard/tenants");
        revalidatePath("/dashboard/admin/licenses");
        return { success: true };
    } catch (error: any) {
        console.error("[reactivateOrganization] Error:", error);
        return { success: false, error: error.message };
    }
}
