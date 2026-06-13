import { prisma } from "@/app/lib/prisma";

/**
 * Returns the list of branch IDs the caller may access for backup operations,
 * or `null` for SUPER_ADMIN (no restriction — sees all backups).
 *
 * Branch users → their own branch. Org admins → all branches in their org.
 * Anyone else → empty list (no access).
 */
export async function resolveTenantBranchIds(tenantCtx: any): Promise<string[] | null> {
    const { user, organizationId } = tenantCtx;

    if (user.role === "SUPER_ADMIN") return null; // unrestricted

    if (user.branchId) return [user.branchId];

    if (organizationId) {
        const branches = await prisma.branch.findMany({
            where: { organizationId },
            select: { id: true },
        });
        return branches.map((b: any) => b.id);
    }

    return []; // no scope → no access
}
