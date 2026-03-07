import { prisma } from "@/app/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";

// GET: Fetch a patient's loyalty account + recent transactions
export async function GET(request: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const patientId = request.nextUrl.searchParams.get("patientId");
        if (!patientId) {
            return NextResponse.json({ error: "patientId is required" }, { status: 400 });
        }

        const account = await prisma.loyaltyAccount.findUnique({
            where: { patientId },
            include: {
                transactions: {
                    orderBy: { createdAt: "desc" },
                    take: 20,
                },
                patient: { select: { name: true, phone: true } },
            },
        });

        if (!account) {
            return NextResponse.json({ account: null, message: "No loyalty account" });
        }

        return NextResponse.json({ account });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
    }
}

// POST: Create a loyalty account for a patient
export async function POST(request: Request) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const { patientId } = await request.json();
        if (!patientId) {
            return NextResponse.json({ error: "patientId is required" }, { status: 400 });
        }

        // Check if already exists
        const existing = await prisma.loyaltyAccount.findUnique({
            where: { patientId },
        });

        if (existing) {
            return NextResponse.json({ account: existing });
        }

        const account = await prisma.loyaltyAccount.create({
            data: { patientId },
        });

        return NextResponse.json({ account });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
}
