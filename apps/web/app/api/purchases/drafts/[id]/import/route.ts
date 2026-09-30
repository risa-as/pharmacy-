export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { markDraftImported, DraftError } from '@/app/lib/purchase-drafts';

/** OPEN-14: the draft was opened in the order form (recorded once). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        return NextResponse.json(await markDraftImported(ctx, (await params).id));
    } catch (e) {
        if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: e.status });
        console.error('[purchase-drafts] import', e);
        return NextResponse.json({ error: 'تعذر تسجيل فتح المسودة' }, { status: 500 });
    }
}
