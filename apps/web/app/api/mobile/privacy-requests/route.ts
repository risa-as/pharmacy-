import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { prisma } from '@/app/lib/prisma';
import { createPrivacyRequest, PRIVACY_ENTITY, privacyRequestView } from '@/app/lib/privacy-requests';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
    const ctx = await getTenantContext('read');
    if (ctx instanceof NextResponse) return ctx;
    const rows = await prisma.auditLog.findMany({ where: { userId: ctx.user.id, entity: PRIVACY_ENTITY, action: 'REQUEST' }, orderBy: { createdAt: 'desc' }, take: 20 });
    return NextResponse.json(rows.map(privacyRequestView), { headers });
}
export async function POST(req: Request) {
    const ctx = await getTenantContext('read');
    if (ctx instanceof NextResponse) return ctx;
    const body = await req.json().catch(() => null);
    if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || body.confirmed !== true)
        return NextResponse.json({ error: 'أكد طلب حذف حسابك وبياناتك الشخصية.' }, { status: 400 });
    try {
        return NextResponse.json(await createPrivacyRequest(ctx, body.id), { status: 201, headers });
    } catch {
        return NextResponse.json({ error: 'تعذر تأكيد تسجيل الطلب؛ أعد المحاولة بمعرّفه نفسه.' }, { status: 503 });
    }
}
