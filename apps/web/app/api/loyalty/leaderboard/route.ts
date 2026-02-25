import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

// GET: Top loyalty members leaderboard
export async function GET() {
    try {
        const accounts = await prisma.loyaltyAccount.findMany({
            orderBy: { lifetimePoints: "desc" },
            take: 20,
            include: {
                patient: { select: { name: true, phone: true } },
            },
        });

        return NextResponse.json({ leaderboard: accounts });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }
}
