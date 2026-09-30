export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { resolvePlanningSettings, savePlanningSettings, clearBranchSettings, settingsRights, SettingsError } from '@/app/lib/purchase-planning';

/**
 * OPEN-14 saved smart purchasing settings.
 * GET ?branchId=   effective settings for the branch, where they came from, and who may edit.
 * PUT              { scope: 'ORGANIZATION' | 'BRANCH', branchId?, coverageDays, leadDays, safetyDays, fromArrival, transferDays? }
 * DELETE ?branchId= removes the branch override (the organization default applies again).
 */
function fail(e: unknown) {
    if (e instanceof SettingsError) return NextResponse.json({ error: e.message }, { status: e.status });
    const message = e instanceof Error ? e.message : '';
    if (/خارج نطاق|أيام التغطية/.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    console.error('[planning-settings]', e);
    return NextResponse.json({ error: 'تعذر حفظ الإعدادات' }, { status: 500 });
}

export async function GET(req: Request) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.userPermissions.canViewInventory) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    const branchId = new URL(req.url).searchParams.get('branchId') || ctx.user.branchId;
    if (!branchId) return NextResponse.json({ error: 'حدد الفرع' }, { status: 400 });
    try {
        const settings = await resolvePlanningSettings(ctx, branchId);
        return NextResponse.json({ branchId, ...settings, ...settingsRights(ctx) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) { return fail(e); }
}

export async function PUT(req: Request) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.scope !== 'ORGANIZATION' && body.scope !== 'BRANCH') return NextResponse.json({ error: 'نطاق غير صالح' }, { status: 400 });
    try {
        await savePlanningSettings(ctx, {
            scope: body.scope, branchId: typeof body.branchId === 'string' ? body.branchId : null,
            options: { coverageDays: body.coverageDays as number, leadDays: body.leadDays as number, safetyDays: body.safetyDays as number, fromArrival: body.fromArrival === true },
            transferDays: body.transferDays === undefined || body.transferDays === null ? null : (body.transferDays as number),
        });
        const branchId = typeof body.branchId === 'string' ? body.branchId : ctx.user.branchId;
        return NextResponse.json(branchId ? { branchId, ...(await resolvePlanningSettings(ctx, branchId)), ...settingsRights(ctx) } : { ok: true });
    } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    const branchId = new URL(req.url).searchParams.get('branchId');
    if (!branchId) return NextResponse.json({ error: 'حدد الفرع' }, { status: 400 });
    try {
        const removed = await clearBranchSettings(ctx, branchId);
        return NextResponse.json({ removed, branchId, ...(await resolvePlanningSettings(ctx, branchId)), ...settingsRights(ctx) });
    } catch (e) { return fail(e); }
}
