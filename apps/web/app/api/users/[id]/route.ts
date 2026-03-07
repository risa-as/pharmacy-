import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

// PATCH: Update user (permissions, role, etc.)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (tenantCtx.user.role !== 'ADMIN' && tenantCtx.user.role !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();

        // Only allow updating specific fields
        const allowedFields: Record<string, any> = {};

        if ('permissions' in body) {
            allowedFields.permissions = body.permissions; // null or JSON string
        }
        if ('role' in body) {
            allowedFields.role = body.role;
        }
        if ('name' in body) {
            allowedFields.name = body.name;
        }

        if (Object.keys(allowedFields).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id },
            data: allowedFields,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                permissions: true,
            }
        });

        return NextResponse.json({ user });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: Get single user details
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { id } = await params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                permissions: true,
                branch: { select: { name: true } }
            }
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        return NextResponse.json({ user });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
