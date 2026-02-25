import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

// GET: Fetch loyalty settings
export async function GET() {
    try {
        let settings = await prisma.companySettings.findFirst();
        if (!settings) {
            settings = await prisma.companySettings.create({ data: {} });
        }
        return NextResponse.json({
            loyaltyEnabled: settings.loyaltyEnabled,
            loyaltyPointsPerDinar: settings.loyaltyPointsPerDinar,
            loyaltyRedemptionValue: settings.loyaltyRedemptionValue,
            loyaltyMinRedemption: settings.loyaltyMinRedemption,
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

// PUT: Update loyalty settings
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        let settings = await prisma.companySettings.findFirst();
        if (!settings) {
            settings = await prisma.companySettings.create({ data: {} });
        }

        const updated = await prisma.companySettings.update({
            where: { id: settings.id },
            data: {
                loyaltyEnabled: body.loyaltyEnabled ?? settings.loyaltyEnabled,
                loyaltyPointsPerDinar: body.loyaltyPointsPerDinar ?? settings.loyaltyPointsPerDinar,
                loyaltyRedemptionValue: body.loyaltyRedemptionValue ?? settings.loyaltyRedemptionValue,
                loyaltyMinRedemption: body.loyaltyMinRedemption ?? settings.loyaltyMinRedemption,
            },
        });

        return NextResponse.json({
            loyaltyEnabled: updated.loyaltyEnabled,
            loyaltyPointsPerDinar: updated.loyaltyPointsPerDinar,
            loyaltyRedemptionValue: updated.loyaltyRedemptionValue,
            loyaltyMinRedemption: updated.loyaltyMinRedemption,
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
