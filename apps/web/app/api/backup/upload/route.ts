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
                // Safe diagnostics — no secret/key values leaked.
                console.warn(
                    `[backup/upload] license auth failed: no active license for branch=${headerBranchId} keyLen=${licenseKey.length}`,
                );
                return NextResponse.json({ success: false, message: "Invalid or inactive device license" }, { status: 401 });
            }
            authedBranchId = license.branchId;
        } else {
            const secretKey = req.headers.get("x-backup-secret");
            const configuredSecret = process.env.BACKUP_SECRET_KEY;
            if (!configuredSecret || secretKey !== configuredSecret) {
                // Log presence + lengths (NOT values) so quote/whitespace mismatches
                // are diagnosable from the server logs. e.g. a length of 12 means the
                // value was stored as "R$i1999s$a" *with* the surrounding quotes.
                console.warn(
                    `[backup/upload] legacy secret mismatch: provided=${!!secretKey} providedLen=${secretKey?.length ?? 0} ` +
                    `configured=${!!configuredSecret} configuredLen=${configuredSecret?.length ?? 0} match=${secretKey === configuredSecret}`,
                );
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

        // Resolve the owning org + names so the backup is distinguishable per
        // branch AND per organisation — both in the DB record and in the actual
        // uploaded filename (otherwise every org's backups look identical).
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { name: true, organizationId: true, organization: { select: { name: true } } },
        });
        const organizationId = branch?.organizationId ?? null;

        // Keep Latin alphanumerics + Arabic letters; collapse everything else to a
        // dash. Explicit ranges avoid the \p{} unicode flag (needs es6+ target).
        const slug = (s?: string | null) =>
            (s || "").trim().replace(/[^a-zA-Z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "na";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const niceName = `backup_${slug(branch?.organization?.name)}_${slug(branch?.name)}_${stamp}.db`;

        // Rename without copying the bytes: File wraps the existing Blob.
        const renamedFile = new File([file], niceName, { type: file.type || "application/octet-stream" });

        // 2. Upload to UploadThing
        console.log(`Uploading backup: ${niceName} (${file.size} bytes)`);

        const response = await utapi.uploadFiles([renamedFile]);
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
                branchId: branchId,
                organizationId: organizationId,
            }
        });

        console.log(`Backup saved to DB: ${backupRecord.id}`);

        return NextResponse.json({ success: true, id: backupRecord.id, url: url });

    } catch (error: any) {
        console.error("Backup upload failed:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
