import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

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

        const where: any = {};
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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new audit log entry
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, userName, action, entity, entityId, details, branchId } = body;

        if (!userId || !userName || !action || !entity) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const log = await prisma.auditLog.create({
            data: {
                userId,
                userName,
                action,
                entity,
                entityId: entityId || null,
                details: typeof details === 'object' ? JSON.stringify(details) : details || null,
                branchId: branchId || null,
            }
        });

        return NextResponse.json({ success: true, log });
    } catch (error: any) {
        console.error('Audit Log POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
