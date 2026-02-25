import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
    try {
        const { licenseKey, hardwareId, deviceName } = await req.json();

        if (!licenseKey || !hardwareId) {
            return NextResponse.json(
                { error: "licenseKey and hardwareId are required" },
                { status: 400 }
            );
        }

        const license = await prisma.deviceLicense.findUnique({
            where: { licenseKey },
            include: {
                branch: {
                    include: { organization: true }
                }
            }
        });

        if (!license) {
            return NextResponse.json({ error: "License not found" }, { status: 404 });
        }

        if (!license.isActive || (license.expiresAt && license.expiresAt < new Date())) {
            return NextResponse.json({ error: "License is expired or inactive" }, { status: 403 });
        }

        // Build org/branch context to return to the desktop app
        const tenantContext = {
            organizationId: license.branch.organizationId,
            organizationName: license.branch.organization?.name || null,
            branchId: license.branch.id,
            branchName: license.branch.name,
        };

        // First time activation
        if (!license.hardwareId) {
            await prisma.deviceLicense.update({
                where: { id: license.id },
                data: {
                    hardwareId,
                    deviceName: deviceName || license.deviceName,
                    activatedAt: new Date(),
                    lastSeenAt: new Date(),
                }
            });
            return NextResponse.json({
                success: true,
                message: "License activated successfully",
                ...tenantContext,
            });
        }

        // Already activated, check if hardwareId matches
        if (license.hardwareId === hardwareId) {
            await prisma.deviceLicense.update({
                where: { id: license.id },
                data: { lastSeenAt: new Date(), deviceName: deviceName || license.deviceName }
            });
            return NextResponse.json({
                success: true,
                message: "License already active on this device",
                ...tenantContext,
            });
        }

        // Hardware ID mismatch
        return NextResponse.json(
            { error: "Hardware Mismatch: This license is already bound to another device" },
            { status: 403 }
        );

    } catch (error) {
        console.error("License activation error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

