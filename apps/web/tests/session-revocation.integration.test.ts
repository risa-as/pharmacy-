// Round 2026-09-23 (N14): revocation across web cookie, mobile Bearer and desktop
// sync token, on PostgreSQL through the real Prisma middleware. Legacy tokens
// without a version are accepted as version 0 until the version moves.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

const state = vi.hoisted(() => ({ session: null as any, bearer: null as string | null }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(state.bearer ? { authorization: `Bearer ${state.bearer}` } : {}) }));

process.env.AUTH_SECRET ||= 'integration-only-auth-secret';
process.env.SYNC_TOKEN_SECRET ||= 'integration-only-sync-secret';

// The real client (with its middleware), pointed at the isolated database.
import { prisma } from '../app/lib/prisma';
import { getTenantContext } from '../app/lib/tenant-utils';
import { validateSyncUser } from '../app/lib/sync-auth';
import { generateSyncToken } from '../app/lib/sync-token';
import { SessionUnavailableError, SESSION_REFRESH_UNAVAILABLE } from '../app/lib/session-refresh';

let user: any, org: any, branch: any;
const bearer = (claims: object) => new SignJWT({ userId: user.id, role: user.role, branchId: branch.id, organizationId: org.id, ...claims })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const syncReq = (token: string, version?: number) => new Request('http://localhost/api/sync/x', { headers: {
    'x-sync-token': token, 'x-user-id': user.id, 'x-branch-id': branch.id, 'x-org-id': org.id, 'x-user-role': user.role,
    ...(version ? { 'x-session-version': String(version) } : {}) } });
const ctxStatus = async () => { const c: any = await getTenantContext(); return c?.status ?? 200; };

beforeAll(async () => {
    const key = randomUUID();
    org = await prisma.organization.create({ data: { name: 'R ' + key } });
    branch = await prisma.branch.create({ data: { name: 'R1', organizationId: org.id } });
    user = await prisma.user.create({ data: { email: `r-${key}@test.invalid`, password: 'old-hash', role: 'PHARMACIST', branchId: branch.id } });
});
afterAll(() => prisma.$disconnect());

describe('sessionVersion revocation', () => {
    it('accepts pre-versioning mobile and desktop tokens as version 0', async () => {
        state.session = null;
        state.bearer = await bearer({}); // no sessionVersion claim
        expect(await ctxStatus()).toBe(200);
        const legacy = await validateSyncUser(syncReq(generateSyncToken(user.id, branch.id, org.id, user.role)));
        expect((legacy as any).status ?? 200).toBe(200);
    });

    it('a password change through Prisma bumps the version and revokes every legacy token', async () => {
        await prisma.user.update({ where: { id: user.id }, data: { password: 'new-hash' } });
        const row = await prisma.user.findUnique({ where: { id: user.id } });
        expect(row!.sessionVersion).toBe(1);
        state.bearer = await bearer({});
        expect(await ctxStatus()).toBe(401);
        const legacy = await validateSyncUser(syncReq(generateSyncToken(user.id, branch.id, org.id, user.role)));
        expect((legacy as any).status).toBe(401);
        // Tokens reissued at the new version work.
        state.bearer = await bearer({ sessionVersion: 1 });
        expect(await ctxStatus()).toBe(200);
        const fresh = await validateSyncUser(syncReq(generateSyncToken(user.id, branch.id, org.id, user.role, 1), 1));
        expect((fresh as any).status ?? 200).toBe(200);
        // A desktop build that predates versioning sends no x-session-version
        // header; its reissued v1 token must still verify.
        const oldBuild = await validateSyncUser(syncReq(generateSyncToken(user.id, branch.id, org.id, user.role, 1)));
        expect((oldBuild as any).status ?? 200).toBe(200);
    });

    it('disable then re-enable does not revive tokens issued before the disable', async () => {
        state.bearer = await bearer({ sessionVersion: 1 });
        await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
        await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
        expect(await ctxStatus()).toBe(401);
    });

    it('an unverifiable cookie session refuses instead of using stale claims', async () => {
        state.bearer = null;
        state.session = { user: undefined, error: SESSION_REFRESH_UNAVAILABLE };
        await expect(getTenantContext()).rejects.toBeInstanceOf(SessionUnavailableError);
        const sync = await validateSyncUser(new Request('http://localhost/api/sync/x'));
        expect((sync as any).status).toBe(401);
    });
});
