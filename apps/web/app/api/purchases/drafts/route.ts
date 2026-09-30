export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { createDraft, DraftError } from '@/app/lib/purchase-drafts';

/** OPEN-14: registers a purchase draft handed to the order form (create-if-absent by client id). */
export async function POST(req: Request) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
    try {
        const result = await createDraft(ctx, body);
        return NextResponse.json(result, { status: result.created ? 201 : 200 });
    } catch (e) {
        if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: e.status });
        console.error('[purchase-drafts] create', e);
        return NextResponse.json({ error: 'تعذر تسجيل المسودة' }, { status: 500 });
    }
}
