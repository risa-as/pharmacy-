import type { NextResponse as NextResponseType } from 'next/server';

/**
 * warehouse-context.ts
 *
 * Stage 1 of the المذاخر (Warehouses/B2B) feature — the identity layer.
 *
 * A warehouse account (role === 'WAREHOUSE') belongs to NO pharmacy
 * Organization and NO Branch; it belongs to exactly one Warehouse via
 * User.warehouseId. This module is the single source of truth for deciding
 * whether a caller may act as that warehouse, mirroring the shape of
 * getTenantContext() in tenant-utils.ts (a pure decision + an async
 * session-reading wrapper), and the pure/impure split established by Stage 0
 * in warehouse-access.ts.
 *
 * Scope decision (Stage 1): NextAuth cookie sessions ONLY. Warehouse accounts
 * are web-only for the MVP — unlike getTenantContext(), this module does NOT
 * implement the jose Bearer-JWT fallback used by the mobile app. If/when a
 * warehouse mobile or API-key client is built, that is a separate stage.
 *
 * Impersonation decision (Stage 1): SUPER_ADMIN may NOT impersonate a
 * warehouse. Only role === 'WAREHOUSE' with its own warehouseId succeeds.
 * This keeps the isolation property simple to state and test: possessing a
 * warehouseId never grants access without the WAREHOUSE role, and no role
 * other than WAREHOUSE ever resolves a warehouse context, full stop. A
 * SUPER_ADMIN "view as warehouse" tool, if ever wanted, belongs in a later
 * stage as its own explicit, audited code path — not folded into this guard.
 */

/** Minimal shape this module needs from a session/JWT — no Prisma, no auth() types leak in here. */
export type WarehouseIdentity = {
    role: string;
    warehouseId?: string;
    branchId?: string;
    organizationId?: string;
};

export type WarehouseContextDecision =
    | { ok: true; warehouseId: string }
    | { ok: false; status: 401 | 403; error: string };

/**
 * Pure decision function — no Prisma, no auth(), no next/headers. Unit-tested
 * directly in app/lib/__tests__/warehouse-context.test.ts.
 *
 * Status code convention (so "garbage role string" tests have a definite
 * expected value):
 *   - 401 when there is no identity at all (missing/empty role) — i.e. the
 *     caller isn't really authenticated as anything.
 *   - 403 for every authenticated-but-wrong-shape case: a non-WAREHOUSE role
 *     (known or unknown/garbage), or a WAREHOUSE role with no warehouseId
 *     (a misconfigured account — fail closed rather than guess).
 *
 * Rules:
 *   - role === 'WAREHOUSE' with a non-empty warehouseId -> ok: true.
 *   - role === 'WAREHOUSE' with no/empty warehouseId -> 403 (misconfigured
 *     account; failing closed is safer than treating it as "no warehouse
 *     restriction").
 *   - Every other role (ADMIN, SUPER_ADMIN, PHARMACIST, CASHIER, or any
 *     unrecognized string) -> 403, *even if* a warehouseId happens to be
 *     present on the identity. Possessing the field must never substitute
 *     for having the role — that is the isolation property this function
 *     exists to guarantee.
 */
export function decideWarehouseContext(identity: WarehouseIdentity): WarehouseContextDecision {
    const role = identity?.role;

    if (!role) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    if (role !== 'WAREHOUSE') {
        return { ok: false, status: 403, error: 'Forbidden: not a warehouse account' };
    }

    if (!identity.warehouseId) {
        return { ok: false, status: 403, error: 'Forbidden: warehouse account has no warehouseId' };
    }

    return { ok: true, warehouseId: identity.warehouseId };
}

/**
 * True when this role must be blocked from pharmacy (tenant) routes.
 * The inverse guard — used by pharmacy-side route handlers / middleware to
 * reject warehouse accounts before they can reach tenant-scoped data.
 */
export { isWarehouseRole } from './warehouse-role';

export type WarehouseContext = {
    warehouseId: string;
    user: { id: string; role: string; email?: string; name?: string };
};

/**
 * Async wrapper — reads the current NextAuth session and feeds it through
 * decideWarehouseContext(), matching getTenantContext()'s established
 * return-union style: either the resolved context, or a NextResponse the
 * caller (a route handler) should return as-is.
 *
 * `@/auth` and `next/server` are imported lazily (inside the function body,
 * not at module top-level) so this file stays importable — and its pure
 * functions above stay unit-testable — under the vitest config in this repo,
 * which has no path-alias/module resolution set up for `@/*` and would
 * otherwise drag in next-auth and PrismaClient just to test pure logic.
 * See app/lib/warehouse-access.ts for the same pure/impure split rationale.
 *
 * Not wrapped in React's cache() (unlike getTenantContext) — that memoizes
 * within a single request/render, which isn't needed for this stage's single
 * placeholder page and would only add another moving part to reason about.
 */
export async function getWarehouseContext(): Promise<WarehouseContext | NextResponseType> {
    const { auth } = await import('@/auth');
    const { NextResponse } = await import('next/server');

    const session = await auth();
    // Same outage rule as getTenantContext: never proceed on unverified claims,
    // and throw rather than 401 so pages don't redirect-loop through /login.
    const { SESSION_REFRESH_UNAVAILABLE, SessionUnavailableError } = await import('@/app/lib/session-refresh');
    if ((session as any)?.error === SESSION_REFRESH_UNAVAILABLE) throw new SessionUnavailableError();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prisma } = await import('@/app/lib/prisma');
    if (!session.user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const actor = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isActive: true, warehouseId: true, warehouse: { select: { isActive: true } } },
    });
    if (!actor?.isActive || !actor.warehouse?.isActive) {
        return NextResponse.json({ error: 'الحساب أو المذخر غير مفعّل.' }, { status: 403 });
    }
    const identity: WarehouseIdentity = {
        role: actor.role,
        warehouseId: actor.warehouseId ?? undefined,
    };

    const decision = decideWarehouseContext(identity);
    if (!decision.ok) {
        return NextResponse.json({ error: decision.error }, { status: decision.status });
    }

    return {
        warehouseId: decision.warehouseId,
        user: {
            id: session.user.id!,
            role: session.user.role!,
            email: session.user.email ?? undefined,
            name: session.user.name ?? undefined,
        },
    };
}
