export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
    try {
        const { licenseKey, hardwareId } = await req.json();

        if (!licenseKey || !hardwareId) {
            return NextResponse.json(
                { error: "licenseKey and hardwareId are required" },
                { status: 400 }
            );
        }

        const license = await prisma.deviceLicense.findUnique({
            where: { licenseKey },
            include: { branch: true }
        });

        if (!license) {
            return NextResponse.json({ error: "License not found or invalid key" }, { status: 401 });
        }

        if (license.hardwareId !== hardwareId) {
            return NextResponse.json(
                { error: "Hardware Mismatch: Operating on an unauthorized device" },
                { status: 403 }
            );
        }

        if (!license.isActive || (license.expiresAt && license.expiresAt < new Date())) {
            return NextResponse.json(
                { error: "License is expired or inactive. Please renew your subscription." },
                { status: 403 }
            );
        }

        // Update last seen
        await prisma.deviceLicense.update({
            where: { id: license.id },
            data: { lastSeenAt: new Date() }
        });

        return NextResponse.json({
            success: true,
            valid: true,
            branch: license.branch
        });

    } catch (error) {
        console.error("License verification error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
