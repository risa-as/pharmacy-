export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { generateLicenseKey } from "@/app/lib/license-utils";
import bcrypt from "bcryptjs";

/**
 * POST /api/admin/provision-tenant
 *
 * Concierge Onboarding — Creates Organization + Branch + Admin User + DeviceLicense
 * all inside a single transaction to guarantee data consistency.
 *
 * Body: { pharmacyName, ownerEmail, ownerPassword, ownerName?, durationMonths? }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        const user = session?.user as { role?: string } | undefined;
        if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await req.json();
        const { pharmacyName, ownerEmail, ownerPassword, ownerName, durationMonths } = body;

        if (!pharmacyName || !ownerEmail || !ownerPassword) {
            return NextResponse.json(
                { error: "pharmacyName, ownerEmail, and ownerPassword are required" },
                { status: 400 }
            );
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
        if (existingUser) {
            return NextResponse.json(
                { error: "A user with this email already exists" },
                { status: 409 }
            );
        }

        // Generate unique license key
        let licenseKey = generateLicenseKey();
        let exists = await prisma.deviceLicense.findUnique({ where: { licenseKey } });
        while (exists) {
            licenseKey = generateLicenseKey();
            exists = await prisma.deviceLicense.findUnique({ where: { licenseKey } });
        }

        // Calculate expiry
        const expiresAt = durationMonths
            ? new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000)
            : null;

        // Hash password
        const hashedPassword = await bcrypt.hash(ownerPassword, 10);

        // ===== Run everything in a single transaction =====
        const result = await prisma.$transaction(async (tx: any) => {
            // 1. Create Organization
            const organization = await tx.organization.create({
                data: { name: pharmacyName },
            });

            // 2. Create Branch (default "الفرع الرئيسي")
            const branch = await tx.branch.create({
                data: {
                    name: "الفرع الرئيسي",
                    organizationId: organization.id,
                },
            });

            // 3. Create Admin User linked to the branch
            const adminUser = await tx.user.create({
                data: {
                    email: ownerEmail,
                    name: ownerName || pharmacyName,
                    password: hashedPassword,
                    role: "ADMIN",
                    branchId: branch.id,
                },
            });

            // 4. Create DeviceLicense linked to the branch
            const license = await tx.deviceLicense.create({
                data: {
                    licenseKey,
                    branchId: branch.id,
                    isActive: true,
                    expiresAt,
                },
            });

            return {
                organization,
                branch,
                user: {
                    id: adminUser.id,
                    email: adminUser.email,
                    name: adminUser.name,
                    role: adminUser.role,
                },
                license: {
                    id: license.id,
                    licenseKey: license.licenseKey,
                    expiresAt: license.expiresAt,
                },
            };
        });

        return NextResponse.json({
            success: true,
            ...result,
        }, { status: 201 });

    } catch (error) {
        console.error("Provision tenant error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
