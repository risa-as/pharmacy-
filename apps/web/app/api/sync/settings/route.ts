import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const settings = await prisma.companySettings.findFirst();
        console.log("API Settings Found:", settings);
        console.log("DB URL Env:", process.env.DATABASE_URL ? "Defined" : "Undefined");
        return NextResponse.json(settings || {});
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}
