export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { prisma } from "@/app/lib/prisma"; // Adjust import if needed

const utapi = new UTApi();

export async function POST(req: Request) {
    try {
        // 1. Authentication — prefer per-device license binding; the branchId is
        //    then derived from the validated license, never trusted from the body.
        //    The legacy shared secret is still accepted during the rollout so
        //    desktop builds that predate this change keep working until updated.
        const licenseKey = req.headers.get("x-device-license-key");
        const headerBranchId = req.headers.get("x-branch-id");

        let authedBranchId: string | null = null;

        if (licenseKey && headerBranchId) {
            const license = await prisma.deviceLicense.findFirst({
                where: { licenseKey, branchId: headerBranchId, isActive: true },
                select: { branchId: true },
            });
            if (!license) {
                return NextResponse.json({ success: false, message: "Invalid or inactive device license" }, { status: 401 });
            }
            authedBranchId = license.branchId;
        } else {
            const secretKey = req.headers.get("x-backup-secret");
            const configuredSecret = process.env.BACKUP_SECRET_KEY;
            if (!configuredSecret || secretKey !== configuredSecret) {
                console.error("Unauthorized backup attempt");
                return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
            }
            console.warn("[backup/upload] Legacy shared-secret auth used — migrate this device to license-key auth.");
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        // License-bound uploads use the validated branch; legacy uploads fall back
        // to the body value for backward compatibility.
        const branchId = authedBranchId ?? ((formData.get("branchId") as string) || "default");

        if (!file) {
            return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
        }

        // 2. Upload to UploadThing
        console.log(`Uploading backup: ${file.name} (${file.size} bytes)`);

        const response = await utapi.uploadFiles([file]);
        const uploadedFile = response[0];

        if (uploadedFile.error) {
            throw new Error(uploadedFile.error.message);
        }

        const { url, name, size } = uploadedFile.data;

        // 3. Save to Database
        const backupRecord = await prisma.backup.create({
            data: {
                name: name,
                url: url,
                size: size,
                branchId: branchId
            }
        });

        console.log(`Backup saved to DB: ${backupRecord.id}`);

        return NextResponse.json({ success: true, id: backupRecord.id, url: url });

    } catch (error: any) {
        console.error("Backup upload failed:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
