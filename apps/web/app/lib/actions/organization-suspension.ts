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
 * Starts (or extends) a free trial for an organisation:
 * 1. Sets subscriptionEndsAt = now + trialDays and marks isTrial = true.
 * 2. Lifts any manual suspension and restores suspension-killed licenses,
 *    so the tenant can start using the system immediately.
 *
 * A trial reuses the subscriptionEndsAt field, so all existing enforcement
 * (login, sync, desktop offline token, dashboard overlay) — including the
 * 5-day grace window — applies automatically once the trial expires.
 */
export async function startTrial(
    orgId: string,
    trialDays: number,
): Promise<{ success: boolean; error?: string; subscriptionEndsAt?: Date }> {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "SUPER_ADMIN") {
            return { success: false, error: "Unauthorized" };
        }

        const days = Math.floor(Number(trialDays));
        if (!Number.isFinite(days) || days <= 0) {
            return { success: false, error: "عدد أيام التجربة يجب أن يكون رقماً موجباً" };
        }

        const subscriptionEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        const branches = await prisma.branch.findMany({
            where: { organizationId: orgId },
            select: { id: true },
        });
        const branchIds = branches.map((b) => b.id);

        await prisma.$transaction(async (tx) => {
            await tx.organization.update({
                where: { id: orgId },
                data: {
                    subscriptionEndsAt,
                    isTrial: true,
                    isSuspended: false,
                    suspendedAt: null,
                },
            });

            // Restore licenses that were disabled by a previous org suspension.
            await tx.deviceLicense.updateMany({
                where: {
                    branchId: { in: branchIds },
                    suspendedByOrgSuspension: true,
                },
                data: { isActive: true, suspendedByOrgSuspension: false },
            });
        });

        revalidatePath("/dashboard/admin/tenants");
        revalidatePath("/dashboard/admin/licenses");
        return { success: true, subscriptionEndsAt };
    } catch (error: any) {
        console.error("[startTrial] Error:", error);
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
