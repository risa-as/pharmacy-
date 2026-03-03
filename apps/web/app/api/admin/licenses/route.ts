import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { generateLicenseKey } from "@/app/lib/license-utils";

// GET — Fetch all licenses with branch data
export async function GET() {
    try {
        const session = await auth();
        const user = session?.user as { role?: string } | undefined;
        if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const licenses = await prisma.deviceLicense.findMany({
            include: {
                branch: {
                    include: {
                        organization: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(licenses);
    } catch (error) {
        console.error("Failed to fetch licenses:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST — Generate a new license
export async function POST(req: Request) {
    try {
        const session = await auth();
        const user = session?.user as { role?: string } | undefined;
        if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await req.json();
        const { branchId, durationMonths, organizationId } = body;

        if (!branchId) {
            return NextResponse.json({ error: "branchId is required" }, { status: 400 });
        }
        if (!organizationId) {
            return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
        }

        // Verify branch exists and belongs to the specified organisation (DRM binding)
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        }
        if (branch.organizationId !== organizationId) {
            return NextResponse.json(
                { error: "Branch does not belong to the specified organisation" },
                { status: 400 }
            );
        }

        // Generate unique license key
        let licenseKey = generateLicenseKey();
        // Ensure uniqueness (very unlikely collision but safety first)
        let exists = await prisma.deviceLicense.findUnique({ where: { licenseKey } });
        while (exists) {
            licenseKey = generateLicenseKey();
            exists = await prisma.deviceLicense.findUnique({ where: { licenseKey } });
        }

        // Calculate expiry date
        const expiresAt = durationMonths
            ? new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000)
            : null;

        const license = await prisma.deviceLicense.create({
            data: {
                licenseKey,
                branchId,
                isActive: true,
                expiresAt,
            },
            include: {
                branch: {
                    include: { organization: true },
                },
            },
        });

        return NextResponse.json(license, { status: 201 });
    } catch (error) {
        console.error("Failed to create license:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
