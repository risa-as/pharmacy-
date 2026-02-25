import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");

        const where: any = {};
        if (branchId) {
            where.OR = [{ branchId }, { branchId: null }];
        }

        const patients = await prisma.patient.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: { loyaltyAccount: true }
        });

        console.log(`Sync patients: branchId=${branchId}, count=${patients.length}`);
        return NextResponse.json({ patients });
    } catch (error) {
        console.error("Sync Patients Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
