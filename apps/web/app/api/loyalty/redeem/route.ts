import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

// POST: Redeem loyalty points for a discount
// Body: { patientId, points }
export async function POST(request: Request) {
    try {
        const { patientId, points } = await request.json();

        if (!patientId || !points) {
            return NextResponse.json({ error: "patientId and points are required" }, { status: 400 });
        }

        // 1. Get settings
        const settings = await prisma.companySettings.findFirst();
        if (!settings?.loyaltyEnabled) {
            return NextResponse.json({ error: "Loyalty program is disabled" }, { status: 400 });
        }

        // 2. Check minimum
        if (points < settings.loyaltyMinRedemption) {
            return NextResponse.json({
                error: `الحد الأدنى للاستبدال ${settings.loyaltyMinRedemption} نقطة`,
            }, { status: 400 });
        }

        // 3. Get account
        const account = await prisma.loyaltyAccount.findUnique({
            where: { patientId },
        });

        if (!account) {
            return NextResponse.json({ error: "لا يوجد حساب ولاء لهذا المريض" }, { status: 404 });
        }

        // 4. Check balance
        if (account.totalPoints < points) {
            return NextResponse.json({
                error: `رصيد النقاط غير كافٍ. الرصيد الحالي: ${account.totalPoints} نقطة`,
            }, { status: 400 });
        }

        // 5. Calculate discount value
        const discountAmount = points * settings.loyaltyRedemptionValue;

        // 6. Deduct points + log transaction
        const updated = await prisma.loyaltyAccount.update({
            where: { id: account.id },
            data: {
                totalPoints: { decrement: points },
            },
        });

        await prisma.loyaltyTransaction.create({
            data: {
                accountId: account.id,
                type: "REDEEM",
                points: -points,
                description: `استبدال ${points} نقطة بخصم ${discountAmount.toLocaleString()} د.ع`,
            },
        });

        return NextResponse.json({
            redeemed: points,
            discountAmount,
            remainingPoints: updated.totalPoints,
        });
    } catch (error) {
        console.error("Redeem points error:", error);
        return NextResponse.json({ error: "Failed to redeem points" }, { status: 500 });
    }
}
