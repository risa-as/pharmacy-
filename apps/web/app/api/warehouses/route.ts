export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';

// GET: List all warehouses
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const tenantCtx = await getTenantContext();
        if (!(tenantCtx instanceof NextResponse) && tenantCtx.organizationId) {
            const access = await checkFeatureAccess(tenantCtx.organizationId, 'warehouseManagement');
            if (!access.allowed) {
                return NextResponse.json({
                    error: 'هذه الميزة متاحة في باقة الشركات فقط.',
                    code: 'FEATURE_NOT_IN_PLAN',
                    requiredPlan: 'ENTERPRISE'
                }, { status: 403 });
            }
        }

        const warehouses = await prisma.warehouse.findMany({
            include: { _count: { select: { orders: true } } },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json({ warehouses });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Create a new warehouse
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenantCtx = await getTenantContext();
        if (!(tenantCtx instanceof NextResponse) && tenantCtx.organizationId) {
            const access = await checkFeatureAccess(tenantCtx.organizationId, 'warehouseManagement');
            if (!access.allowed) {
                return NextResponse.json({
                    error: 'هذه الميزة متاحة في باقة الشركات فقط.',
                    code: 'FEATURE_NOT_IN_PLAN',
                    requiredPlan: 'ENTERPRISE'
                }, { status: 403 });
            }
        }

        const body = await req.json();
        const { name, code, phone, address, city, contactPerson, email, apiEndpoint, apiKey, notes } = body;

        if (!name) return NextResponse.json({ error: "اسم المستودع مطلوب" }, { status: 400 });

        const warehouse = await prisma.warehouse.create({
            data: { name, code, phone, address, city, contactPerson, email, apiEndpoint, apiKey, notes }
        });

        return NextResponse.json({ warehouse }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
