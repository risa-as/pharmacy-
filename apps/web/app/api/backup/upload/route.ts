import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { prisma } from "@/app/lib/prisma"; // Adjust import if needed

const utapi = new UTApi();

export async function POST(req: Request) {
    try {
        // 1. Security Check
        const secretKey = req.headers.get("x-backup-secret");
        const configuredSecret = process.env.BACKUP_SECRET_KEY;

        if (!configuredSecret || secretKey !== configuredSecret) {
            console.error("Unauthorized backup attempt");
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const branchId = formData.get("branchId") as string || "default";

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
