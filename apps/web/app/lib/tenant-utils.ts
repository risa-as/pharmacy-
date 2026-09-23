import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getUserPermissions, UserPermissions } from '@/app/lib/permissions';
import { isWarehouseRole } from '@/app/lib/warehouse-context';
import { prisma } from '@/app/lib/prisma';
import { SESSION_REFRESH_UNAVAILABLE, SessionUnavailableError } from '@/app/lib/session-refresh';

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
        // Database unavailable while verifying the cookie: refuse without falling
        // back to stale claims. Thrown (not a 401) so pages reach their error
        // boundary instead of redirect("/login"), which middleware would bounce back.
        if ((session as any)?.error === SESSION_REFRESH_UNAVAILABLE) throw new SessionUnavailableError();

        let role: string;
        // Mobile Bearer tokens carry the sessionVersion they were issued with (none = 0).
        let tokenSessionVersion: number | null = null;
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
                tokenSessionVersion = Number(payload.sessionVersion) || 0;
            } catch {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        // Claims prove identity; current database values determine access. Disabling
        // or moving an employee must take effect before their JWT expires.
        if (typeof userId !== 'string' || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, isActive: true, branchId: true, permissions: true, sessionVersion: true, branch: { select: { organizationId: true } } },
        });
        if (!currentUser?.isActive) return NextResponse.json({ error: 'Account disabled or unavailable' }, { status: 403 });
        // Cookie sessions are version-checked in auth.ts; Bearer tokens here.
        if (tokenSessionVersion !== null && tokenSessionVersion !== currentUser.sessionVersion)
            return NextResponse.json({ error: 'Session revoked' }, { status: 401 });
        role = currentUser.role;
        branchId = currentUser.branchId ?? undefined;
        organizationId = currentUser.branch?.organizationId;
        permissionsOverride = currentUser.permissions;

        // Stage 1 (المذاخر/B2B): a WAREHOUSE account belongs to no Organization
        // and no Branch — it must never resolve a pharmacy tenant context.
        // Today this is *also* true implicitly, because such an account has no
        // branchId and would fall through to the "Branch not assigned" 403
        // below. That is emergent, not enforced: the moment anyone sets a
        // branchId on a WAREHOUSE-role user (an admin UI, a seed script, a bad
        // migration), tenant isolation would silently evaporate. Reject on the
        // role itself so the property holds regardless of the other fields.
        if (isWarehouseRole(role)) {
            return NextResponse.json(
                { error: "Warehouse accounts cannot access pharmacy data" },
                { status: 403 }
            );
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
