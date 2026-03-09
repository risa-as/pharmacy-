export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";

// GET: Fetch loyalty settings
export async function GET() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.organizationId) {
        return NextResponse.json({ error: "No organization assigned" }, { status: 400 });
    }

    try {
        let organization = await prisma.organization.findUnique({
            where: { id: tenantCtx.organizationId }
        });

        if (!organization) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json({
            loyaltyEnabled: organization.loyaltyEnabled,
            loyaltyPointsPerDinar: organization.loyaltyPointsPerDinar,
            loyaltyRedemptionValue: organization.loyaltyRedemptionValue,
            loyaltyMinRedemption: organization.loyaltyMinRedemption,
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

// PUT: Update loyalty settings
export async function PUT(request: Request) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.organizationId) {
        return NextResponse.json({ error: "No organization assigned" }, { status: 400 });
    }

    try {
        const body = await request.json();
        const organizationId = tenantCtx.organizationId;

        const loyaltyData = {
            loyaltyEnabled: body.loyaltyEnabled,
            loyaltyPointsPerDinar: body.loyaltyPointsPerDinar !== undefined ? Number(body.loyaltyPointsPerDinar) : undefined,
            loyaltyRedemptionValue: body.loyaltyRedemptionValue !== undefined ? Number(body.loyaltyRedemptionValue) : undefined,
            loyaltyMinRedemption: body.loyaltyMinRedemption !== undefined ? Number(body.loyaltyMinRedemption) : undefined,
        };

        const updated = await prisma.organization.update({
            where: { id: organizationId },
            data: loyaltyData,
        });

        // Keep CompanySettings in sync so the Desktop sync route (/sync/settings)
        // always reflects the correct loyalty configuration.
        const existingSettings = await prisma.companySettings.findFirst();
        if (existingSettings) {
            await prisma.companySettings.update({
                where: { id: existingSettings.id },
                data: loyaltyData,
            });
        }

        return NextResponse.json({
            loyaltyEnabled: updated.loyaltyEnabled,
            loyaltyPointsPerDinar: updated.loyaltyPointsPerDinar,
            loyaltyRedemptionValue: updated.loyaltyRedemptionValue,
            loyaltyMinRedemption: updated.loyaltyMinRedemption,
        });
    } catch (error) {
        console.error("Loyalty update error:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
