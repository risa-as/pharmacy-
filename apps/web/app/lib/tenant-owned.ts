import type { TenantContext } from './tenant-utils';

/**
 * Ownership rules for records that carry an optional `organizationId`
 * (insurance companies, discounts — N20).
 *
 * - A row with an organisation belongs to that organisation only.
 * - A row SUPER_ADMIN marked `isPlatformShared` is readable by everyone.
 * - A row with neither is legacy data of unknown ownership. Unknown is not
 *   shared: it is hidden from organisations (never guessed) until SUPER_ADMIN
 *   assigns it or marks it shared (dashboard/admin/ownership).
 * Only the owner changes a row; rows without an owner only SUPER_ADMIN.
 */
export function readableByTenant(ctx: TenantContext): Record<string, unknown> {
    if (ctx.user.role === 'SUPER_ADMIN') return {};
    const shared = { organizationId: null, isPlatformShared: true };
    if (!ctx.organizationId) return shared;
    return { OR: [{ organizationId: ctx.organizationId }, shared] };
}

export function changeableByTenant(ctx: TenantContext, row: { organizationId: string | null } | null): boolean {
    if (!row) return false;
    if (ctx.user.role === 'SUPER_ADMIN') return true;
    return !!ctx.organizationId && row.organizationId === ctx.organizationId;
}

/** Owner stamped on a new row: the caller's organisation, or none for SUPER_ADMIN. */
export function ownerForNewRow(ctx: TenantContext): string | null {
    return ctx.user.role === 'SUPER_ADMIN' ? null : ctx.organizationId ?? null;
}
