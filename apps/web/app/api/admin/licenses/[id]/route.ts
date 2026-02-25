import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

// PATCH — Toggle isActive, update expiresAt, or unbind hardware
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        const user = session?.user as { role?: string } | undefined;
        if (user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id } = params;
        const body = await req.json();
        const { isActive, expiresAt, unbindHardware } = body;

        const existing = await prisma.deviceLicense.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "License not found" }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};

        if (typeof isActive === "boolean") {
            updateData.isActive = isActive;
        }

        if (expiresAt !== undefined) {
            updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
        }

        // Allow admin to unbind hardware (e.g., when client gets a new PC)
        if (unbindHardware === true) {
            updateData.hardwareId = null;
            updateData.deviceName = null;
            updateData.activatedAt = null;
        }

        const updated = await prisma.deviceLicense.update({
            where: { id },
            data: updateData,
            include: {
                branch: {
                    include: { organization: true },
                },
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update license:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE — Remove a license permanently
export async function DELETE(
    _req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        const user = session?.user as { role?: string } | undefined;
        if (user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id } = params;

        await prisma.deviceLicense.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete license:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
