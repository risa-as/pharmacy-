import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { aiDisclosure } from '@/app/lib/ai-disclosure';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
    const ctx = await getTenantContext('read');
    if (ctx instanceof NextResponse) return ctx;
    const scope = new URL(req.url).searchParams.get('scope');
    if (scope !== 'assistant' && scope !== 'prescription') return NextResponse.json({ error: 'نوع الخدمة غير صالح' }, { status: 400 });
    return NextResponse.json(aiDisclosure(scope), { headers: { 'Cache-Control': 'private, no-store' } });
}
