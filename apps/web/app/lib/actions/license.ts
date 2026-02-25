"use server";

import { prisma } from "@/app/lib/prisma";

/**
 * Suspends all active DeviceLicenses belonging to the given organisation.
 * Uses suspendedByOrgSuspension = true to distinguish org-driven kills
 * from individually deactivated licenses, enabling accurate restoration later.
 */
export async function suspendOrgLicenses(orgId: string): Promise<void> {
    const branches = await prisma.branch.findMany({
        where: { organizationId: orgId },
        select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);
    if (branchIds.length === 0) return;

    await prisma.$transaction([
        prisma.deviceLicense.updateMany({
            where: {
                branchId: { in: branchIds },
                isActive: true,
            },
            data: {
                isActive: false,
                suspendedByOrgSuspension: true,
            },
        }),
    ]);
}

/**
 * Restores only the licenses that were deactivated due to an org suspension.
 * Licenses that were independently deactivated before the suspension are
 * left untouched (suspendedByOrgSuspension = false on those).
 */
export async function reactivateOrgLicenses(orgId: string): Promise<void> {
    const branches = await prisma.branch.findMany({
        where: { organizationId: orgId },
        select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);
    if (branchIds.length === 0) return;

    await prisma.$transaction([
        prisma.deviceLicense.updateMany({
            where: {
                branchId: { in: branchIds },
                suspendedByOrgSuspension: true,
            },
            data: {
                isActive: true,
                suspendedByOrgSuspension: false,
            },
        }),
    ]);
}
