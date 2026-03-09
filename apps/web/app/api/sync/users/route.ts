export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from '@/auth';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get('branchId');

        if (!branchId) {
            return NextResponse.json({ error: "Branch ID required" }, { status: 400 });
        }

        // Validate branchId ownership
        const userRole = (session.user as any).role;
        const userBranchId = (session.user as any).branchId;
        const userOrgId = (session.user as any).organizationId;
        if (userRole !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
            if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
            if (userRole === 'ADMIN') {
                if (branch.organizationId !== userOrgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            } else {
                if (branchId !== userBranchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const users = await prisma.user.findMany({
            where: { branchId },
            select: {
                id: true,
                name: true,
                email: true,
                password: true, // bcrypt hash required for offline desktop login
                role: true,
                branchId: true
            }
        });

        return NextResponse.json({ users });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}
