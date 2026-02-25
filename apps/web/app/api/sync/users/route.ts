import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get('branchId');

        if (!branchId) {
            return NextResponse.json({ error: "Branch ID required" }, { status: 400 });
        }

        const users = await prisma.user.findMany({
            where: { branchId },
            select: {
                id: true,
                name: true,
                email: true,
                password: true, // We need to sync password hash (or plain if not hashed yet) to allow local login
                role: true,
                branchId: true
            }
        });

        return NextResponse.json({ users });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}
