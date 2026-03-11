import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { headers } from 'next/headers';
import { cache } from 'react';

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
}

// Pre-encode the secret once at module load time instead of on every request.
const _jwtSecret = new TextEncoder().encode(
    process.env.AUTH_SECRET ?? (() => { throw new Error('AUTH_SECRET env var is not set'); })()
);

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

        if (session?.user) {
            role = session.user.role || 'CASHIER';
            organizationId = (session.user as any).organizationId as string | undefined;
            branchId = session.user.branchId as string | undefined;
            userId = session.user.id!;
        } else {
            // Fallback: Bearer JWT token (mobile app)
            const headersList = await headers();
            const authHeader = headersList.get('authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            const token = authHeader.slice(7);
            try {
                const { payload } = await jwtVerify(token, _jwtSecret);
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

        if (isSuperAdmin) {
            tenantWhere = {};
            tenantBranchWhere = {};
        } else if (isAdmin) {
            if (!organizationId) {
                return NextResponse.json({ error: "Organization not found for Admin user" }, { status: 403 });
            }
            tenantWhere = { organizationId };
            tenantBranchWhere = { branch: { organizationId } };
        } else {
            if (!branchId) {
                return NextResponse.json({ error: "Branch not assigned to user" }, { status: 403 });
            }
            tenantWhere = { branchId };
            tenantBranchWhere = { branchId };
        }

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
        };
    }
);
