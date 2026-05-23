export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';

// GET: List audit logs with filters
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const userId = searchParams.get('userId');
        const entity = searchParams.get('entity');
        const action = searchParams.get('action');
        const branchId = searchParams.get('branchId');
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const search = searchParams.get('search');

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canViewAuditLog) {
            return NextResponse.json({ error: "ليس لديك صلاحية لعرض سجل التدقيق." }, { status: 403 });
        }
        const { user, organizationId } = tenantCtx;

        // AuditLog has branchId directly (no branch relation), so build custom scope
        let auditScope: any = {};
        if (user.role !== 'SUPER_ADMIN') {
            if (organizationId) {
                const branches = await prisma.branch.findMany({
                    where: { organizationId },
                    select: { id: true },
                });
                const branchIds = branches.map((b: any) => b.id);
                // Also include entries with branchId=null where userId belongs to the org
                const orgUserIds = await prisma.user.findMany({
                    where: { branch: { organizationId } },
                    select: { id: true },
                }).then((us: any[]) => us.map((u: any) => u.id));
                auditScope = {
                    OR: [
                        { branchId: { in: branchIds } },
                        { branchId: null, userId: { in: orgUserIds } },
                    ],
                };
            } else if (user.branchId) {
                auditScope = {
                    OR: [
                        { branchId: user.branchId },
                        { branchId: null, userId: user.id },
                    ],
                };
            }
        }

        const where: any = { ...auditScope };
        if (userId) where.userId = userId;
        if (entity) where.entity = entity;
        if (action) where.action = action;
        if (branchId) where.branchId = branchId;
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = toDate;
            }
        }
        if (search) {
            where.OR = [
                { userName: { contains: search, mode: 'insensitive' } },
                { details: { contains: search, mode: 'insensitive' } },
                { entityId: { contains: search } },
            ];
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.auditLog.count({ where })
        ]);

        return NextResponse.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        console.error('Audit Log GET Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Create a new audit log entry
export async function POST(req: NextRequest) {
    try {
        // Identity is taken from the authenticated session — never from the body —
        // so audit entries can't be spoofed or forged by anonymous callers.
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        const body = await req.json();
        const { action, entity, entityId, details } = body;

        if (!action || !entity) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const log = await prisma.auditLog.create({
            data: {
                userId: user.id,
                userName: user.name ?? user.email ?? 'Unknown',
                action,
                entity,
                entityId: entityId || null,
                details: typeof details === 'object' ? JSON.stringify(details) : details || null,
                branchId: user.branchId || null,
            }
        });

        return NextResponse.json({ success: true, log });
    } catch (error: any) {
        console.error('Audit Log POST Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
