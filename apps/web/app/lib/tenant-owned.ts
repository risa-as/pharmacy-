import type { TenantContext } from './tenant-utils';

/**
 * Ownership rules for records that carry an optional `organizationId`
 * (insurance companies, discounts — N20).
 *
 * - A row with an organisation belongs to that organisation only.
 * - A row without one is a legacy/platform row: its owner is unknown and is
 *   never guessed. Every organisation may read it (as before N20), only
 *   SUPER_ADMIN may change it.
 */
export function readableByTenant(ctx: TenantContext): Record<string, unknown> {
    if (ctx.user.role === 'SUPER_ADMIN') return {};
    if (!ctx.organizationId) return { organizationId: null };
    return { OR: [{ organizationId: ctx.organizationId }, { organizationId: null }] };
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
