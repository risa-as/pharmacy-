export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { markDraftCompleted, DraftError } from '@/app/lib/purchase-drafts';

/** OPEN-14: the draft is closed — every line sent, or the rest dropped on purpose (recorded once). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        return NextResponse.json(await markDraftCompleted(ctx, (await params).id));
    } catch (e) {
        if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: e.status });
        console.error('[purchase-drafts] complete', e);
        return NextResponse.json({ error: 'تعذر إغلاق المسودة' }, { status: 500 });
    }
}
