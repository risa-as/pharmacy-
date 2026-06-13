export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // Adjust import
import { getTenantContext } from "@/app/lib/tenant-utils";
import { resolveTenantBranchIds } from "@/app/lib/backup-scope";

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canBackup) {
            return NextResponse.json({ success: false, message: "ليس لديك صلاحية للنسخ الاحتياطي." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const filename = searchParams.get("file");

        if (!filename) {
            return NextResponse.json({ success: false, message: "File required" }, { status: 400 });
        }

        // Find backup by name in DB — scoped to the caller's tenant so one
        // organization can't download another's backup by guessing the filename.
        const branchIds = await resolveTenantBranchIds(tenantCtx);
        const backup = await prisma.backup.findFirst({
            where: {
                name: filename,
                ...(branchIds ? { branchId: { in: branchIds } } : {}),
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!backup) {
            return NextResponse.json({ success: false, message: "Backup not found" }, { status: 404 });
        }

        // Redirect to UploadThing URL
        return NextResponse.redirect(backup.url);

    } catch (error: any) {
        console.error("Download error:", error);
        return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
    }
}
