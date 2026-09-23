import { describe, expect, it, vi } from 'vitest';
import type { JWT } from 'next-auth/jwt';
import { refreshSessionToken } from '../session-refresh';
import { withSessionRevocation } from '../session-revocation';

const staleAdmin = (over: object = {}): JWT => ({ id: 'u1', role: 'SUPER_ADMIN', branchId: null, organizationId: null, permissions: null, warehouseId: null, ...over } as JWT);
const row = (over: object = {}) => ({ role: 'SUPER_ADMIN', isActive: true, branchId: null, permissions: null, warehouseId: null, sessionVersion: 0, branch: null, ...over });

describe('refreshSessionToken (N01, N14)', () => {
    it('replaces a demoted role instead of trusting the sign-in claim', async () => {
        const token = await refreshSessionToken(staleAdmin(), async () => row({ role: 'CASHIER', branchId: 'b1', branch: { organizationId: 'orgA' }, permissions: '{"canSell":false}' }));
        expect(token).toMatchObject({ role: 'CASHIER', branchId: 'b1', organizationId: 'orgA', permissions: '{"canSell":false}' });
    });

    it('ends the session of a disabled or deleted account, or a token without an id', async () => {
        expect(await refreshSessionToken(staleAdmin(), async () => row({ isActive: false }))).toBeNull();
        expect(await refreshSessionToken(staleAdmin(), async () => null)).toBeNull();
        const lookup = vi.fn();
        expect(await refreshSessionToken({} as JWT, lookup)).toBeNull();
        expect(lookup).not.toHaveBeenCalled();
    });

    it('treats a pre-versioning token as version 0 and revokes it once the version moves', async () => {
        expect(await refreshSessionToken(staleAdmin(), async () => row({ sessionVersion: 0 }))).not.toBeNull();
        expect(await refreshSessionToken(staleAdmin(), async () => row({ sessionVersion: 1 }))).toBeNull();
        expect(await refreshSessionToken(staleAdmin({ sessionVersion: 1 }), async () => row({ sessionVersion: 1 }))).not.toBeNull();
    });

    it('on a database failure keeps the cookie but marks it unverified, without refreshing claims', async () => {
        const token = await refreshSessionToken(staleAdmin(), async () => { throw new Error('db down'); });
        expect(token).toMatchObject({ refreshFailed: true, role: 'SUPER_ADMIN' });
        // Recovery clears the marker.
        const recovered = await refreshSessionToken(token!, async () => row({ role: 'ADMIN' }));
        expect(recovered).toMatchObject({ role: 'ADMIN' });
        expect(recovered).not.toHaveProperty('refreshFailed');
    });
});

describe('refreshSessionToken: subscription state (N10)', () => {
    const inOrg = (organization: object) => row({ role: 'ADMIN', branchId: 'b1', branch: { organizationId: 'orgA', organization } });
    const day = 86400000;
    it('follows a suspension, a lapse into grace, and a renewal without a new sign-in', async () => {
        const signedIn = staleAdmin({ role: 'ADMIN', subscriptionState: 'active' });
        expect(await refreshSessionToken({ ...signedIn }, async () => inOrg({ isSuspended: true, subscriptionEndsAt: null }))).toMatchObject({ subscriptionState: 'suspended' });
        expect(await refreshSessionToken({ ...signedIn }, async () => inOrg({ isSuspended: false, subscriptionEndsAt: new Date(Date.now() - 2 * day) }))).toMatchObject({ subscriptionState: 'grace' });
        const graced = staleAdmin({ role: 'ADMIN', subscriptionState: 'grace' });
        expect(await refreshSessionToken(graced, async () => inOrg({ isSuspended: false, subscriptionEndsAt: new Date(Date.now() + 60 * day) }))).toMatchObject({ subscriptionState: 'active' });
    });

    it('treats an account without a branch as active and keeps the value when the organisation was not loaded', async () => {
        expect(await refreshSessionToken(staleAdmin({ subscriptionState: 'grace' }), async () => row())).toMatchObject({ subscriptionState: 'active' });
        const kept = await refreshSessionToken(staleAdmin({ subscriptionState: 'grace' }), async () => row({ branchId: 'b1', branch: { organizationId: 'orgA' } }));
        expect(kept).toMatchObject({ subscriptionState: 'grace' });
    });
});

describe('withSessionRevocation middleware', () => {
    it('bumps sessionVersion on password change and on disabling, including upsert', () => {
        expect(withSessionRevocation({ model: 'User', action: 'update', args: { where: { id: 'u' }, data: { password: 'h' } } }).args.data)
            .toEqual({ password: 'h', sessionVersion: { increment: 1 } });
        expect(withSessionRevocation({ model: 'User', action: 'updateMany', args: { data: { isActive: false } } }).args.data.sessionVersion)
            .toEqual({ increment: 1 });
        expect(withSessionRevocation({ model: 'User', action: 'upsert', args: { update: { password: 'h' }, create: {} } }).args.update.sessionVersion)
            .toEqual({ increment: 1 });
    });

    it('leaves ordinary edits, re-enabling, and other models alone', () => {
        const edit = { model: 'User', action: 'update', args: { data: { name: 'x', isActive: true } } };
        expect(withSessionRevocation(edit)).toEqual(edit);
        expect(withSessionRevocation({ model: 'User', action: 'update', args: { data: { name: 'x' } } }).args.data).toEqual({ name: 'x' });
        const other = { model: 'Branch', action: 'update', args: { data: { isActive: false } } };
        expect(withSessionRevocation(other)).toBe(other);
    });
});
