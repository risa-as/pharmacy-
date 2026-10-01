export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { providerConfig } from '@/app/lib/ai-assistant';

export async function GET() {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.user.role !== 'ADMIN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });

    // Same check as the chat route: the key of the provider actually selected.
    const config = providerConfig();
    return NextResponse.json({ provider: config.ok ? config.provider : null, configured: config.ok });
}
