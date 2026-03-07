import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";

// POST: Earn points from a sale
// Body: { patientId, saleId, amount }
export async function POST(request: Request) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const { patientId, saleId, amount } = await request.json();

        if (!patientId || !amount) {
            return NextResponse.json({ error: "patientId and amount are required" }, { status: 400 });
        }

        if (!tenantCtx.organizationId) {
            return NextResponse.json({ error: "No organization assigned" }, { status: 400 });
        }

        // 1. Get loyalty settings
        const settings = await prisma.organization.findUnique({
            where: { id: tenantCtx.organizationId },
            select: { loyaltyEnabled: true, loyaltyPointsPerDinar: true }
        });

        if (!settings?.loyaltyEnabled) {
            return NextResponse.json({ error: "Loyalty program is disabled" }, { status: 400 });
        }

        const pointsPerDinar = settings.loyaltyPointsPerDinar;

        // 2. Calculate points based on tier multiplier
        let account = await prisma.loyaltyAccount.findUnique({
            where: { patientId },
        });

        // Auto-create account if doesn't exist
        if (!account) {
            account = await prisma.loyaltyAccount.create({
                data: { patientId },
            });
        }

        // Tier multiplier
        let multiplier = 1;
        if (account.tier === "SILVER") multiplier = 1.5;
        if (account.tier === "GOLD") multiplier = 2;

        const rawPoints = Math.floor(amount * pointsPerDinar * multiplier);

        if (rawPoints <= 0) {
            return NextResponse.json({ points: 0, message: "Amount too small for points" });
        }

        // 3. Update account + create transaction
        const newLifetime = account.lifetimePoints + rawPoints;

        // Auto-upgrade tier
        let newTier = account.tier;
        if (newLifetime >= 20000) newTier = "GOLD";
        else if (newLifetime >= 5000) newTier = "SILVER";

        const updated = await prisma.loyaltyAccount.update({
            where: { id: account.id },
            data: {
                totalPoints: { increment: rawPoints },
                lifetimePoints: { increment: rawPoints },
                tier: newTier,
            },
        });

        await prisma.loyaltyTransaction.create({
            data: {
                accountId: account.id,
                type: "EARN",
                points: rawPoints,
                saleId: saleId || null,
                description: `كسب ${rawPoints} نقطة من فاتورة بقيمة ${amount.toLocaleString()} د.ع`,
            },
        });

        return NextResponse.json({
            points: rawPoints,
            totalPoints: updated.totalPoints,
            tier: updated.tier,
            tierUpgraded: newTier !== account.tier,
        });
    } catch (error) {
        console.error("Earn points error:", error);
        return NextResponse.json({ error: "Failed to earn points" }, { status: 500 });
    }
}
