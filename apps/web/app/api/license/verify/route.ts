export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { checkDeviceLimit, getPlanFeatures } from "@/app/lib/saas-guards";
import { enforceRateLimit } from "@/app/lib/rate-limit";

export async function POST(req: Request) {
    try {
        const limited = await enforceRateLimit(req, "license-verify", 30, 60_000);
        if (limited) return limited;

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

        // Fetch device limit status for the desktop app to show usage info
        const orgId = license.branch.organizationId;
        const [deviceLimit, planFeatures] = await Promise.all([
            checkDeviceLimit(orgId),
            getPlanFeatures(orgId),
        ]);

        return NextResponse.json({
            success: true,
            valid: true,
            branch: license.branch,
            planInfo: {
                currentDevices: deviceLimit.current,
                maxDevices: deviceLimit.max,
            },
            planFeatures,
        });

    } catch (error) {
        console.error("License verification error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
