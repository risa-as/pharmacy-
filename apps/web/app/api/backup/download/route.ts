export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // Adjust import

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const filename = searchParams.get("file");

        if (!filename) {
            return NextResponse.json({ success: false, message: "File required" }, { status: 400 });
        }

        // Find backup by name in DB
        const backup = await prisma.backup.findFirst({
            where: { name: filename },
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
