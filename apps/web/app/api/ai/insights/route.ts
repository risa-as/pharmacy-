export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { buildCard } from '@/app/lib/ai-insights';

/**
 * GET /api/ai/insights?kind=reorder|waste|daily[&branchId=][&days=]
 * Deterministic assistant cards straight from the system data. No language
 * model is involved, so it works without an AI key and does not use the daily
 * AI quota. Same audience as the assistant (branch/organization managers).
 */
export async function GET(req: Request) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.user.role !== 'ADMIN') return NextResponse.json({ error: 'هذه الميزة متاحة للمدير فقط' }, { status: 403 });

    const p = new URL(req.url).searchParams;
    const kind = p.get('kind') ?? '';
    if (!['reorder', 'waste', 'daily'].includes(kind)) return NextResponse.json({ error: 'نوع غير معروف' }, { status: 400 });
    const days = p.get('days');
    try {
        const card = await buildCard(kind, ctx, { branchId: p.get('branchId'), windowDays: days ? Number(days) : undefined });
        return NextResponse.json({ card }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: any) {
        console.error('[AI insights]', e);
        return NextResponse.json({ error: e?.message ?? 'تعذر إعداد البطاقة' }, { status: 400 });
    }
}
