/**
 * Unified authentication for sync API routes.
 * Accepts any of:
 *   1. x-sync-token + x-user-id + x-branch-id + x-org-id + x-user-role  (desktop login token)
 *   2. x-device-license-key + x-branch-id                                (device license)
 *   3. NextAuth session cookie                                            (web dashboard)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import crypto from 'crypto';

export interface SyncUser {
    id: string;
    role: string;
    branchId?: string;
    organizationId?: string;
    name?: string;
    email?: string;
}

function getSyncSecret(): string {
    const secret = process.env.SYNC_TOKEN_SECRET;
    if (!secret) {
        // Fail loudly rather than fall back to a hardcoded secret that anyone
        // reading the source could use to forge tokens for any user/role/org.
        throw new Error('SYNC_TOKEN_SECRET env var is not set');
    }
    return secret;
}

function verifySyncToken(token: string, userId: string, branchId: string, orgId: string, role: string): boolean {
    const expected = crypto.createHmac('sha256', getSyncSecret())
        .update(`${userId}:${branchId}:${orgId}:${role}`)
        .digest('hex');
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch — guard so a wrong-length token
    // is a clean "false" instead of a thrown 500.
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

export async function validateSyncUser(request: Request): Promise<SyncUser | NextResponse> {
    const h = request.headers as Headers;

    // ── 1. Sync token (desktop after login) ─────────────────────────────────
    const syncToken = h.get('x-sync-token');
    const userId    = h.get('x-user-id');
    const branchId  = h.get('x-branch-id');
    const orgId     = h.get('x-org-id');
    const role      = h.get('x-user-role');

    if (syncToken && userId && branchId && orgId && role) {
        try {
            if (!verifySyncToken(syncToken, userId, branchId, orgId, role)) {
                return NextResponse.json({ error: 'Invalid sync token' }, { status: 401 });
            }
            return { id: userId, role, branchId, organizationId: orgId };
        } catch {
            return NextResponse.json({ error: 'Sync token validation failed' }, { status: 401 });
        }
    }

    // ── 2. Device license key (Electron — fallback if no syncToken) ──────────
    const licenseKey = h.get('x-device-license-key');
    if (licenseKey && branchId) {
        const license = await prisma.deviceLicense.findFirst({
            where: { licenseKey, branchId, isActive: true },
            select: { id: true, branchId: true, branch: { select: { organizationId: true } } },
        });
        if (!license) {
            return NextResponse.json({ error: 'Invalid or inactive device license' }, { status: 401 });
        }
        return {
            id: license.id,
            role: 'DEVICE',
            branchId: license.branchId,
            organizationId: license.branch.organizationId,
        };
    }

    // ── 3. NextAuth session (web dashboard) ──────────────────────────────────
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return {
        id: session.user.id,
        role: (session.user as any).role || 'CASHIER',
        branchId: (session.user as any).branchId,
        organizationId: (session.user as any).organizationId,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
    };
}

/**
 * Verifies that the given branch is within the authenticated sync user's scope.
 *  - SUPER_ADMIN: any branch
 *  - ADMIN: any branch within their organization
 *  - CASHIER / DEVICE / others: only their own assigned branch
 * Returns false for unknown branches or out-of-scope access.
 */
export async function isBranchInSyncScope(
    syncUser: SyncUser,
    branchId: string | null | undefined
): Promise<boolean> {
    if (syncUser.role === 'SUPER_ADMIN') return true;
    if (!branchId) return false;

    if (syncUser.role === 'ADMIN' || syncUser.role === 'MANAGER') {
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { organizationId: true },
        });
        return !!branch && branch.organizationId === syncUser.organizationId;
    }
    return branchId === syncUser.branchId;
}
