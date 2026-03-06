import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export interface TenantContext {
    user: {
        id: string;
        role: string;
        branchId?: string;
        organizationId?: string;
    };
    // Helper to inject into Prisma "where" clauses to automatically filter by tenant/branch
    tenantWhere: Record<string, any>;
    // Same as above but used when the target table relates to branch (e.g., target -> branch -> organization)
    tenantBranchWhere: Record<string, any>;
}

/**
 * Retrieves the current user's session and extracts their tenant isolation context.
 * Useful for any API route to ensure queries are strictly bounded to their organization or branch.
 * Usage: const { tenantWhere, tenantBranchWhere, user } = await requireTenantContext();
 */
export async function getTenantContext(): Promise<TenantContext | NextResponse> {
    const session = await auth();

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role || 'CASHIER';
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isAdmin = role === 'ADMIN';

    const organizationId = (session.user as any).organizationId as string | undefined;
    const branchId = session.user.branchId as string | undefined;

    let tenantWhere: Record<string, any> = {};
    let tenantBranchWhere: Record<string, any> = {};

    if (isSuperAdmin) {
        // Super admins see everything across all tenants. No filters applied.
        tenantWhere = {};
        tenantBranchWhere = {};
    } else if (isAdmin) {
        // Admins see everything within their organization.
        if (!organizationId) {
            return NextResponse.json({ error: "Organization not found for Admin user" }, { status: 403 });
        }
        tenantWhere = { organizationId };
        tenantBranchWhere = { branch: { organizationId } };
    } else {
        // Staff see only their specific branch.
        if (!branchId) {
            return NextResponse.json({ error: "Branch not assigned to user" }, { status: 403 });
        }
        tenantWhere = { branchId }; // If the model has branchId directly
        tenantBranchWhere = { branchId }; // Fallback equivalent
    }

    return {
        user: {
            id: session.user.id!,
            role,
            branchId,
            organizationId
        },
        tenantWhere,
        tenantBranchWhere
    };
}
