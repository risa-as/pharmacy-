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
        const branchId = searchParams.get("branchId");

        // Validate branchId ownership: ensure the caller can only access their own branch/org
        if (branchId) {
            const userRole = (session.user as any).role;
            const userBranchId = (session.user as any).branchId;
            const userOrgId = (session.user as any).organizationId;

            if (userRole !== 'SUPER_ADMIN') {
                const branch = await prisma.branch.findUnique({
                    where: { id: branchId },
                    select: { organizationId: true }
                });
                if (!branch) {
                    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
                }
                if (userRole === 'ADMIN') {
                    if (branch.organizationId !== userOrgId) {
                        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
                    }
                } else {
                    if (branchId !== userBranchId) {
                        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
                    }
                }
            }
        }

        const where: any = {};
        if (branchId) {
            where.OR = [{ branchId }, { branchId: null }];
        }

        const patients = await prisma.patient.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: { loyaltyAccount: true }
        });

        console.log(`Sync patients: branchId=${branchId}, count=${patients.length}`);
        return NextResponse.json({ patients });
    } catch (error) {
        console.error("Sync Patients Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
