import { prisma } from '@/app/lib/prisma';
import type { TenantContext } from '@/app/lib/tenant-utils';
import { validatePlanningOptions, type PlanningOptions } from '@/app/lib/smart-purchasing';
import { DEFAULT_PLANNING_OPTIONS, DEFAULT_TRANSFER_DAYS, MAX_TRANSFER_DAYS, validTransferDays, type SettingsSource } from '@/app/lib/purchase-planning-shared';

/**
 * OPEN-14: saved smart purchasing settings. Resolution: the branch override,
 * else the organization default, else the built-in defaults. The smart
 * purchasing page and the assistant's reorder card both read them here, so
 * they always compute with the same numbers.
 */

export const ORG_SCOPE = 'ORG';

type Row = { coverageDays: number; leadDays: number; safetyDays: number; fromArrival: boolean; transferDays: number; updatedAt: Date };
const toOptions = (r: Row): PlanningOptions => ({ coverageDays: r.coverageDays, leadDays: r.leadDays, safetyDays: r.safetyDays, fromArrival: r.fromArrival });
const view = (r: Row | null) => (r ? { ...toOptions(r), transferDays: r.transferDays, updatedAt: r.updatedAt.toISOString() } : null);

async function branchInScope(ctx: TenantContext, branchId: string) {
    return prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id: branchId }] }, select: { id: true, organizationId: true } });
}

/** Who may change what: the organization default needs the settings permission. */
export function settingsRights(ctx: TenantContext) {
    const p = ctx.userPermissions;
    return {
        canEditOrganization: !!ctx.organizationId && p.canChangeSettings,
        // A branch override only changes suggestions for that branch.
        canEditBranch: !!ctx.organizationId && (p.canChangeSettings || p.canCreateWarehouseOrder),
    };
}

export async function resolvePlanningSettings(ctx: TenantContext, branchId: string): Promise<{
    options: PlanningOptions; source: SettingsSource;
    /** From the same saved row as the options (branch, else organization, else the default). */
    transferDays: number;
    organization: ReturnType<typeof view>; branch: ReturnType<typeof view>;
}> {
    const branch = await branchInScope(ctx, branchId);
    if (!branch) throw new Error('الفرع خارج نطاق صلاحياتك');
    const rows = await prisma.purchasePlanningSettings.findMany({
        where: { organizationId: branch.organizationId, scopeKey: { in: [ORG_SCOPE, branch.id] } },
    });
    const org = rows.find(r => r.scopeKey === ORG_SCOPE) ?? null;
    const own = rows.find(r => r.scopeKey === branch.id) ?? null;
    // A stored row that no longer validates (limits changed) falls back instead of failing the page.
    const valid = (r: Row | null) => { if (!r) return null; try { validatePlanningOptions(toOptions(r)); return r; } catch { return null; } };
    const picked = valid(own) ? { r: own!, source: 'BRANCH' as const } : valid(org) ? { r: org!, source: 'ORGANIZATION' as const } : null;
    return {
        options: picked ? toOptions(picked.r) : { ...DEFAULT_PLANNING_OPTIONS },
        source: picked ? picked.source : 'DEFAULT',
        transferDays: picked && validTransferDays(picked.r.transferDays) ? picked.r.transferDays : DEFAULT_TRANSFER_DAYS,
        organization: view(org),
        branch: view(own),
    };
}

export async function savePlanningSettings(ctx: TenantContext, input: { scope: 'ORGANIZATION' | 'BRANCH'; branchId?: string | null; options: PlanningOptions; transferDays?: number | null }) {
    const rights = settingsRights(ctx);
    const options: PlanningOptions = {
        coverageDays: Number(input.options.coverageDays), leadDays: Number(input.options.leadDays),
        safetyDays: Number(input.options.safetyDays), fromArrival: input.options.fromArrival === true,
    };
    validatePlanningOptions(options);
    // Optional: a save that leaves it out keeps the stored value.
    const transferDays = input.transferDays ?? null;
    if (transferDays !== null && !validTransferDays(transferDays)) throw new SettingsError(400, `مدة النقل من 0 إلى ${MAX_TRANSFER_DAYS} أيام`);
    let organizationId: string, branchId: string | null = null;
    if (input.scope === 'ORGANIZATION') {
        if (!rights.canEditOrganization) throw new SettingsError(403, 'تعديل إعداد المؤسسة يحتاج صلاحية تغيير الإعدادات');
        organizationId = ctx.organizationId!;
    } else {
        if (!rights.canEditBranch) throw new SettingsError(403, 'ليس لديك صلاحية حفظ إعدادات الفرع');
        const branch = input.branchId ? await branchInScope(ctx, input.branchId) : null;
        if (!branch) throw new SettingsError(403, 'الفرع خارج نطاق صلاحياتك');
        organizationId = branch.organizationId; branchId = branch.id;
    }
    const scopeKey = branchId ?? ORG_SCOPE;
    // A new branch row without a value inherits the organization's, not the built-in 1.
    const inherited = transferDays ?? (branchId
        ? (await prisma.purchasePlanningSettings.findUnique({ where: { organizationId_scopeKey: { organizationId, scopeKey: ORG_SCOPE } }, select: { transferDays: true } }))?.transferDays
        : undefined) ?? DEFAULT_TRANSFER_DAYS;
    return prisma.purchasePlanningSettings.upsert({
        where: { organizationId_scopeKey: { organizationId, scopeKey } },
        create: { organizationId, branchId, scopeKey, ...options, transferDays: inherited, updatedById: ctx.user.id },
        update: { ...options, ...(transferDays !== null ? { transferDays } : {}), updatedById: ctx.user.id },
    });
}

/** Removes a branch override so the branch follows the organization default again. */
export async function clearBranchSettings(ctx: TenantContext, branchId: string) {
    if (!settingsRights(ctx).canEditBranch) throw new SettingsError(403, 'ليس لديك صلاحية حفظ إعدادات الفرع');
    const branch = await branchInScope(ctx, branchId);
    if (!branch) throw new SettingsError(403, 'الفرع خارج نطاق صلاحياتك');
    const { count } = await prisma.purchasePlanningSettings.deleteMany({ where: { organizationId: branch.organizationId, scopeKey: branch.id } });
    return count;
}

export class SettingsError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}
