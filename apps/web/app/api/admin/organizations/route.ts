import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await auth();
        const user = session?.user as { role?: string } | undefined;
        if (user?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const organizations = await prisma.organization.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });

        return NextResponse.json(organizations);
    } catch (error) {
        console.error("Failed to fetch organizations:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
