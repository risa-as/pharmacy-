import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get("branchId") || session.user.branchId;

        if (!branchId) {
            return NextResponse.json({ error: "Branch ID required" }, { status: 400 });
        }

        const stocktakes = await prisma.stocktake.findMany({
            where: { branchId },
            include: {
                user: { select: { name: true, email: true } },
                _count: { select: { items: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ stocktakes });
    } catch (error: any) {
        console.error("GET Stocktakes error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const branchId = body.branchId || session.user.branchId;

        if (!branchId) {
            return NextResponse.json({ error: "Branch ID required" }, { status: 400 });
        }

        // Check if there's already a pending stocktake for this branch
        const existingPending = await prisma.stocktake.findFirst({
            where: { branchId, status: "PENDING" }
        });

        if (existingPending) {
            return NextResponse.json({ error: "يوجد جلسة جرد نشطة بالفعل لهذا الفرع. يرجى إكمالها أو إلغائها أولاً." }, { status: 400 });
        }

        const stocktake = await prisma.stocktake.create({
            data: {
                branchId,
                userId: session.user.id,
                status: "PENDING",
                notes: body.notes || null,
            }
        });

        return NextResponse.json({ success: true, stocktake });
    } catch (error: any) {
        console.error("POST Stocktake error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
