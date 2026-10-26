import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { prisma } from '@/app/lib/prisma';
import { PRIVACY_ENTITY, PRIVACY_STATUSES, privacyRequestView, updatePrivacyRequest } from '@/app/lib/privacy-requests';
export const dynamic = 'force-dynamic';
async function admin() {
    const ctx = await getTenantContext('read');
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    return ctx;
}
export async function GET(req: Request) {
    const ctx = await admin();
    if (ctx instanceof NextResponse) return ctx;
    const page = Math.max(1, Math.min(10000, Number(new URL(req.url).searchParams.get('page')) || 1));
    const where = { entity: PRIVACY_ENTITY, action: 'REQUEST' };
    const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30, skip: (Math.floor(page) - 1) * 30 }), prisma.auditLog.count({ where })]);
    return NextResponse.json({ requests: rows.map(privacyRequestView), total }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(req: Request) {
    const ctx = await admin();
    if (ctx instanceof NextResponse) return ctx;
    const body = await req.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || !PRIVACY_STATUSES.includes(body.status) || typeof body.response !== 'string' || body.response.trim().length < 10 || body.response.length > 2000)
        return NextResponse.json({ error: 'حدد الحالة واكتب رداً واضحاً عن المعالجة والبيانات المحتفظ بها.' }, { status: 400 });
    const result = await updatePrivacyRequest(ctx, body.id, body.status, body.response.trim());
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'الطلب غير موجود.' }, { status: 404 });
}
