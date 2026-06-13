export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // Adjust import if needed
import { getTenantContext } from "@/app/lib/tenant-utils";
import { resolveTenantBranchIds } from "@/app/lib/backup-scope";

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canBackup) {
            return NextResponse.json({ success: false, message: "ليس لديك صلاحية للنسخ الاحتياطي." }, { status: 403 });
        }

        // Scope backups to the caller's tenant — never expose other organizations' backups.
        const branchIds = await resolveTenantBranchIds(tenantCtx);

        const backups = await prisma.backup.findMany({
            where: branchIds ? { branchId: { in: branchIds } } : {},
            orderBy: { createdAt: 'desc' },
            take: 20, // Limit to last 20 backups
        });

        // Resolve branch (and org) names so the list distinguishes which branch /
        // organisation each backup belongs to.
        const refBranchIds = Array.from(
            new Set(backups.map((b: any) => b.branchId).filter(Boolean) as string[])
        );
        const branchRows = refBranchIds.length
            ? await prisma.branch.findMany({
                where: { id: { in: refBranchIds } },
                select: { id: true, name: true, organization: { select: { name: true } } },
            })
            : [];
        const branchMap = new Map(branchRows.map((b: any) => [b.id, b]));

        // Map to format expected by UI
        const formattedBackups = backups.map((b: any) => {
            const branch = b.branchId ? branchMap.get(b.branchId) : null;
            return {
                id: b.id,
                name: b.name,
                size: b.size,
                date: b.createdAt,
                url: b.url, // Include URL for direct download
                branchId: b.branchId ?? null,
                branchName: branch?.name ?? null,
                organizationName: branch?.organization?.name ?? null,
            };
        });

        return NextResponse.json({ success: true, backups: formattedBackups });

    } catch (error: any) {
        console.error("List backups error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
