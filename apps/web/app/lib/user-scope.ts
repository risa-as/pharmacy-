import { prisma } from '@/app/lib/prisma';
import type { TenantContext } from '@/app/lib/tenant-utils';

/**
 * Who may manage which users. Internal helpers, deliberately not Server Actions.
 *
 * Outside the platform owner (SUPER_ADMIN), a managed user must have a branch inside
 * the caller's scope: a user with no branch (the platform owner, warehouse users) is
 * never in scope, and neither is a SUPER_ADMIN or WAREHOUSE account.
 */

/** Fields a user read may return: never the stored password. */
export const USER_SAFE_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    branchId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    branch: { select: { id: true, name: true, organizationId: true } },
} as const;

const isPlatformOwner = (ctx: TenantContext) => ctx.user.role === 'SUPER_ADMIN';

/** Prisma filter for the users the caller may see or manage. */
export function managedUserWhere(ctx: TenantContext) {
    if (isPlatformOwner(ctx)) return {};
    // A delegated manager (a non-ADMIN given canManageUsers) never manages an ADMIN.
    const roles: ('ADMIN' | 'PHARMACIST' | 'CASHIER')[] = ctx.user.role === 'ADMIN' ? ['ADMIN', 'PHARMACIST', 'CASHIER'] : ['PHARMACIST', 'CASHIER'];
    return { role: { in: roles }, branch: { is: ctx.branchModelWhere } };
}

/** The target user, if the caller may manage it; otherwise null (never says why). */
export async function findManagedUser(ctx: TenantContext, id: string) {
    if (typeof id !== 'string' || !id) return null;
    return prisma.user.findFirst({ where: { AND: [{ id }, managedUserWhere(ctx)] }, select: USER_SAFE_SELECT });
}

/** The branch, if it is inside the caller's scope. */
export async function findScopedBranch(ctx: TenantContext, branchId: string) {
    if (typeof branchId !== 'string' || !branchId) return null;
    return prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id: branchId }] }, select: { id: true, organizationId: true } });
}

/** Granting ADMIN is an owner decision: only an ADMIN or the platform owner may do it. */
export function mayAssignRole(ctx: TenantContext, role: string) {
    return role !== 'ADMIN' || ctx.user.role === 'ADMIN' || isPlatformOwner(ctx);
}
