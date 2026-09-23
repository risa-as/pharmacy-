export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser, isBranchInSyncScope } from '@/app/lib/sync-auth';


export async function GET(request: Request) {
    try {
        const syncUser = await validateSyncUser(request);
        if (syncUser instanceof NextResponse) return syncUser;

        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId") || syncUser.branchId;
        // No branch is never an instruction to list every tenant. Legacy
        // unassigned patients require administrative reconciliation, not sharing.
        if (!branchId || !(await isBranchInSyncScope(syncUser, branchId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const where = { branchId };

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
