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
import { getSubscriptionState } from '@/app/lib/subscription-state';
import { getUserPermissions, UserPermissions } from '@/app/lib/permissions';
import { syncTokenMessage } from '@/app/lib/sync-token';
import { SESSION_REFRESH_UNAVAILABLE } from '@/app/lib/session-refresh';
import { jwtVerify } from 'jose';
import crypto from 'crypto';
import { enforceDeviceSignature } from './device-auth';

// Lazily encoded once per process — same secret/scheme getTenantContext uses to
// verify the mobile app's Bearer JWT.
let _authJwtSecret: Uint8Array | null = null;
function getAuthJwtSecret(): Uint8Array {
    if (!_authJwtSecret) {
        if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET env var is not set');
        _authJwtSecret = new TextEncoder().encode(process.env.AUTH_SECRET);
    }
    return _authJwtSecret;
}

/**
 * Returns a 403 NextResponse when the organisation is suspended or past its
 * grace window, otherwise null. Lets a suspended tenant's desktop be cut off
 * from sync without changing the (long-lived, backward-compatible) HMAC token.
 */
async function assertOrgActive(organizationId?: string): Promise<NextResponse | null> {
    if (!organizationId) return null; // SUPER_ADMIN / unknown — handled elsewhere
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { isSuspended: true, subscriptionEndsAt: true },
    });
    if (org && getSubscriptionState(org).state === 'suspended') {
        return NextResponse.json(
            { error: 'تم تعليق اشتراك مؤسستكم. المزامنة متوقفة حتى تجديد الاشتراك.', code: 'ORG_SUSPENDED' },
            { status: 403 },
        );
    }
    return null;
}

export interface SyncUser {
    id: string;
    role: string;
    branchId?: string;
    organizationId?: string;
    name?: string;
    email?: string;
    /** Current per-user permission overrides (JSON), re-read from the database. */
    permissions?: string | null;
}

/**
 * Granular permission check for direct sync commands, so a permission removed
 * on the web is also enforced on desktop. DEVICE (license-key) auth identifies a
 * machine, not a person, so it has no permissions to check and is allowed here;
 * that gap is tracked as open in the quality reference (N02).
 */
export function hasSyncPermission(syncUser: SyncUser, key: keyof UserPermissions): boolean {
    if (syncUser.role === 'DEVICE') return true;
    return getUserPermissions({ role: syncUser.role, permissions: syncUser.permissions ?? null })[key];
}

type OperatorLookup = { user: { findFirst(args: any): Promise<{ role: string; permissions: string | null } | null> } };

/**
 * Effective permissions for a synced operation (sale.userId, payment.userId),
 * read from the database at sync time. The device's clock cannot prove an
 * operation predates a permission change, so no timestamp is trusted: an
 * operation that fails the check now becomes a review conflict.
 *
 * The operator id is a client-supplied claim. To stop a restricted session from
 * borrowing a permitted colleague's id, a person-authenticated sync requires the
 * permission from BOTH the authenticated sync user and the named operator (their
 * intersection). A shared POS still works: a permitted session may submit other
 * permitted cashiers' operations. Naming someone else can still misattribute an
 * operation in the audit log, but can no longer grant a permission.
 *  - operator given: must be an active user of this branch, else null (conflict)
 *  - no operator, person-authenticated sync: that person's current permissions
 *  - no operator, DEVICE auth: 'unattributed' (no person to check; tracked open)
 *  - operator given, DEVICE auth: the operator's permissions (no session person)
 */
export async function operatorPermissions(
    db: OperatorLookup, operatorId: string | null | undefined, branchId: string, syncUser: SyncUser,
): Promise<UserPermissions | null | 'unattributed'> {
    const session = syncUser.role === 'DEVICE' ? null
        : getUserPermissions({ role: syncUser.role, permissions: syncUser.permissions ?? null });
    if (operatorId) {
        const operator = await db.user.findFirst({
            where: { id: operatorId, branchId, isActive: true },
            select: { role: true, permissions: true },
        });
        if (!operator) return null;
        const own = getUserPermissions(operator);
        if (!session) return own;
        return Object.fromEntries(Object.keys(own).map(k => [k, own[k as keyof UserPermissions] && session[k as keyof UserPermissions]])) as unknown as UserPermissions;
    }
    return session ?? 'unattributed';
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

function verifySyncToken(token: string, userId: string, branchId: string, orgId: string, role: string, sessionVersion: number): boolean {
    const parts = token.split('.');
    const prefix = token.startsWith('d1.') && parts.length === 4 ? parts.slice(0,3).join('.') + '.' : '';
    const expected = crypto.createHmac('sha256', getSyncSecret())
        .update(prefix + syncTokenMessage(userId, branchId, orgId, role, sessionVersion))
        .digest('hex');
    const tokenBuf = Buffer.from(prefix ? parts[3] : token);
    const expectedBuf = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch — guard so a wrong-length token
    // is a clean "false" instead of a thrown 500.
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

// Signed claims identify the session; current database state determines access.
async function currentSyncUser(id: string, expected?: { role: string; branchId?: string; organizationId?: string; sessionVersion: number }): Promise<SyncUser | NextResponse> {
    if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id }, select: {
        id: true, role: true, isActive: true, branchId: true, name: true, email: true, permissions: true, sessionVersion: true,
        branch: { select: { organizationId: true } },
    } });
    if (!user?.isActive || !['ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER', 'SUPER_ADMIN'].includes(user.role))
        return NextResponse.json({ error: 'الحساب غير متاح للمزامنة.' }, { status: 403 });
    // Revoked token: issued before the user's sessionVersion was bumped. Unlike
    // isActive, this stays revoked if the account is later re-enabled.
    if (expected && expected.sessionVersion !== user.sessionVersion)
        return NextResponse.json({ error: 'تم إبطال الجلسة؛ يلزم تسجيل الدخول مجدداً.' }, { status: 401 });
    const current = { id: user.id, role: user.role, branchId: user.branchId ?? undefined,
        organizationId: user.branch?.organizationId, name: user.name ?? undefined, email: user.email,
        permissions: user.permissions };
    if (expected && (expected.role !== current.role || expected.branchId !== current.branchId || expected.organizationId !== current.organizationId))
        return NextResponse.json({ error: 'تغير نطاق الحساب؛ يلزم تسجيل الدخول مجدداً.' }, { status: 401 });
    if (current.role !== 'SUPER_ADMIN') {
        if (!current.branchId || !current.organizationId) return NextResponse.json({ error: 'Branch not assigned' }, { status: 403 });
        const denied = await assertOrgActive(current.organizationId);
        if (denied) return denied;
    }
    return current;
}

/**
 * Database unreachable (not an auth failure). The desktop treats any 4xx as a
 * permanent client error and moves the operation to its failures list, so an
 * outage must answer 503, which the desktop retries.
 */
export function isDatabaseUnavailable(e: unknown): boolean {
    const err = e as { code?: string; name?: string; message?: string } | null;
    if (!err) return false;
    if (err.name === 'PrismaClientInitializationError') return true;
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(err.code ?? '')) return true;
    return /Can't reach database|connection (timeout|refused|reset)|Server has closed the connection/i.test(err.message ?? '');
}

function verificationUnavailable() {
    return NextResponse.json({ error: 'تعذّر التحقق مؤقتًا؛ ستُعاد المحاولة.' }, { status: 503, headers: { 'Retry-After': '30' } });
}

async function validateSyncUserCore(request: Request): Promise<SyncUser | NextResponse> {
    const h = request.headers as Headers;

    // ── 1. Sync token (desktop after login) ─────────────────────────────────
    const syncToken = h.get('x-sync-token');
    const userId    = h.get('x-user-id');
    const branchId  = h.get('x-branch-id');
    const orgId     = h.get('x-org-id');
    const role      = h.get('x-user-role');

    if (syncToken && userId && branchId && orgId && role) {
        try {
            // Verify against the user's CURRENT sessionVersion from the database, not
            // a client header: desktop builds that predate versioning never send one,
            // yet must accept a token reissued at v1+. A token signed at an older
            // version (revoked) no longer matches. Version 0 is the legacy format.
            const stored = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
            if (!stored) return NextResponse.json({ error: 'Invalid sync token' }, { status: 401 });
            const sessionVersion = stored.sessionVersion;
            if (!verifySyncToken(syncToken, userId, branchId, orgId, role, sessionVersion)) {
                return NextResponse.json({ error: 'Invalid sync token' }, { status: 401 });
            }
            return await currentSyncUser(userId, { role, branchId, organizationId: orgId, sessionVersion });
        } catch (e) {
            if (isDatabaseUnavailable(e)) return verificationUnavailable();
            return NextResponse.json({ error: 'Sync token validation failed' }, { status: 401 });
        }
    }

    // ── 2. Device license key (Electron — fallback if no syncToken) ──────────
    const licenseKey = h.get('x-device-license-key');
    if (licenseKey && branchId) {
        try {
            const license = await prisma.deviceLicense.findFirst({
                where: { licenseKey, branchId, isActive: true },
                select: { id: true, branchId: true, branch: { select: { organizationId: true } } },
            });
            if (!license) {
                return NextResponse.json({ error: 'Invalid or inactive device license' }, { status: 401 });
            }
            const suspended = await assertOrgActive(license.branch.organizationId);
            if (suspended) return suspended;
            return {
                id: license.id,
                role: 'DEVICE',
                branchId: license.branchId,
                organizationId: license.branch.organizationId,
            };
        } catch (e) {
            // N14-L: an outage is retryable (503), not a thrown 500.
            if (isDatabaseUnavailable(e)) return verificationUnavailable();
            throw e;
        }
    }

    // ── 3. Bearer JWT (mobile app) ───────────────────────────────────────────
    // The mobile app authenticates with the same JWT that getTenantContext
    // accepts (Authorization: Bearer …), not a desktop sync token. Without this
    // path, mobile stock-in calls (add-batch / add-to-branch / create-quick)
    // 401 and force a logout.
    const authHeader = h.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const { payload } = await jwtVerify(authHeader.slice(7), getAuthJwtSecret());
            const jwtRole = (payload.role as string) || 'CASHIER';
            const jwtOrg = (payload.organizationId as string) || undefined;
            return await currentSyncUser(payload.userId as string, { role: jwtRole,
                branchId: (payload.branchId as string) || undefined, organizationId: jwtOrg,
                sessionVersion: Number(payload.sessionVersion) || 0 });
        } catch (e) {
            if (isDatabaseUnavailable(e)) return verificationUnavailable();
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
    }

    // ── 4. NextAuth session (web dashboard) ──────────────────────────────────
    try {
        const session = await auth();
        // The cookie could not be re-verified (database unavailable): retryable,
        // not "unauthorized", so the caller keeps its session (N01/N14-L).
        if ((session as any)?.error === SESSION_REFRESH_UNAVAILABLE) return verificationUnavailable();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return await currentSyncUser(session.user.id);
    } catch (e) {
        // N14-L: an outage is retryable (503), not a thrown 500.
        if (isDatabaseUnavailable(e)) return verificationUnavailable();
        throw e;
    }

}

export async function validateSyncUser(request: Request): Promise<SyncUser | NextResponse> {
    const user = await validateSyncUserCore(request);
    if (user instanceof NextResponse) return user;
    const token = request.headers.get('x-sync-token') || '';
    if (!token && !request.headers.get('x-device-license-key')) return user;
    const parts = token.split('.');
    try {
        const rejected = await enforceDeviceSignature(request, token.startsWith('d1.')
            ? {keyId:parts[1],fingerprint:parts[2]} : undefined);
        return rejected || user;
    } catch {
        return NextResponse.json({error:'تعذر التحقق من الجهاز مؤقتًا؛ العمليات محفوظة لإعادة المحاولة.'}, {status:503});
    }
}

// Bootstrap/recovery can only propose a public key for administrator approval.
// Never use this for business operations: it intentionally skips device signing.
export async function validateDeviceEnrollmentUser(request: Request): Promise<SyncUser | NextResponse> {
    const user = await validateSyncUserCore(request);
    if (user instanceof NextResponse) return user;
    if (user.role === 'DEVICE' || !user.branchId) return NextResponse.json({error:'Employee login required'}, {status:403});
    return user;
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
