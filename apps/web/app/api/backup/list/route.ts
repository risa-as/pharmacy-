export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // Adjust import if needed
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canBackup) {
            return NextResponse.json({ success: false, message: "ليس لديك صلاحية للنسخ الاحتياطي." }, { status: 403 });
        }

        // Use default branch for now, matching the upload logic
        const branchId = "default";

        const backups = await prisma.backup.findMany({
            where: {
                // branchId: branchId 
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 20 // Limit to last 20 backups
        });

        // Map to format expected by UI
        const formattedBackups = backups.map((b: any) => ({
            id: b.id,
            name: b.name,
            size: b.size,
            date: b.createdAt,
            url: b.url // Include URL for direct download
        }));

        return NextResponse.json({ success: true, backups: formattedBackups });

    } catch (error: any) {
        console.error("List backups error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
