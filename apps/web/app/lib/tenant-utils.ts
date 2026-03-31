import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getUserPermissions, UserPermissions } from '@/app/lib/permissions';

export interface TenantContext {
    user: {
        id: string;
        name?: string;
        email?: string;
        role: string;
        branchId?: string;
        organizationId?: string;
    };
    organizationId?: string;
    tenantWhere: Record<string, any>;
    tenantBranchWhere: Record<string, any>;
    /** Use this when querying the Branch model directly (uses `id` not `branchId`) */
    branchModelWhere: Record<string, any>;
    /** Merged permissions (role defaults + per-user overrides) */
    userPermissions: UserPermissions;
}

// Lazily encoded once per process; throws only at request time, not at build time.
let _jwtSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
    if (!_jwtSecret) {
        if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET env var is not set');
        _jwtSecret = new TextEncoder().encode(process.env.AUTH_SECRET);
    }
    return _jwtSecret;
}

/**
 * Retrieves the current user's tenant isolation context.
 * Wrapped with React's `cache()` so that multiple calls within the same
 * server request return the same result without re-running auth verification.
 *
 * Supports both NextAuth cookie sessions (web) and Bearer JWT tokens (mobile).
 */
export const getTenantContext = cache(
    async (): Promise<TenantContext | NextResponse> => {
        // Try NextAuth session first (web browser / dashboard)
        const session = await auth();

        let role: string;
        let organizationId: string | undefined;
        let branchId: string | undefined;
        let userId: string;
        let permissionsOverride: string | null = null;

        if (session?.user) {
            role = session.user.role || 'CASHIER';
            organizationId = (session.user as any).organizationId as string | undefined;
            branchId = session.user.branchId as string | undefined;
            userId = session.user.id!;
            permissionsOverride = (session.user as any).permissions ?? null;
        } else {
            // Fallback: Bearer JWT token (mobile app)
            const headersList = await headers();
            const authHeader = headersList.get('authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            const token = authHeader.slice(7);
            try {
                const { payload } = await jwtVerify(token, getJwtSecret());
                userId = payload.userId as string;
                role = (payload.role as string) || 'CASHIER';
                branchId = (payload.branchId as string) || undefined;
                organizationId = (payload.organizationId as string) || undefined;
            } catch {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const isSuperAdmin = role === 'SUPER_ADMIN';
        const isAdmin = role === 'ADMIN' || role === 'MANAGER';

        let tenantWhere: Record<string, any> = {};
        let tenantBranchWhere: Record<string, any> = {};
        let branchModelWhere: Record<string, any> = {};

        if (isSuperAdmin) {
            tenantWhere = {};
            tenantBranchWhere = {};
            branchModelWhere = {};
        } else if (isAdmin) {
            if (!organizationId) {
                return NextResponse.json({ error: "Organization not found for Admin user" }, { status: 403 });
            }
            tenantWhere = { organizationId };
            tenantBranchWhere = { branch: { organizationId } };
            branchModelWhere = { organizationId };
        } else {
            if (!branchId) {
                return NextResponse.json({ error: "Branch not assigned to user" }, { status: 403 });
            }
            tenantWhere = { branchId };
            tenantBranchWhere = { branchId };
            branchModelWhere = { id: branchId };
        }

        const userPermissions = getUserPermissions({ role, permissions: permissionsOverride });

        return {
            user: {
                id: userId,
                name: session?.user?.name ?? undefined,
                email: session?.user?.email ?? undefined,
                role,
                branchId,
                organizationId,
            },
            organizationId,
            tenantWhere,
            tenantBranchWhere,
            branchModelWhere,
            userPermissions,
        };
    }
);
