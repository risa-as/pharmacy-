export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { signOfflineLicense } from "@/app/lib/offline-license";

async function requireSuperAdmin() {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (user?.role !== "SUPER_ADMIN") return null;
    return user;
}

// GET — list issued offline licenses
export async function GET() {
    const user = await requireSuperAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    try {
        const licenses = await prisma.offlineLicense.findMany({
            orderBy: { createdAt: "desc" },
            take: 500,
        });
        return NextResponse.json({ licenses });
    } catch (error: any) {
        console.error("[offline-licenses GET] failed:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST — generate (and persist) a new offline license code
export async function POST(req: Request) {
    const user = await requireSuperAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    try {
        const body = await req.json();
        const hardwareId = String(body.hardwareId || "").trim();
        const pharmacyName = String(body.pharmacyName || "").trim();
        const licensedTo = body.licensedTo ? String(body.licensedTo).trim() : undefined;
        const expiryDays = body.expiryDays ? parseInt(String(body.expiryDays), 10) : 0;

        if (!hardwareId) return NextResponse.json({ error: "بصمة الجهاز مطلوبة." }, { status: 400 });
        if (!pharmacyName) return NextResponse.json({ error: "اسم الصيدلية مطلوب." }, { status: 400 });
        if (expiryDays && (!Number.isFinite(expiryDays) || expiryDays <= 0)) {
            return NextResponse.json({ error: "عدد أيام الصلاحية غير صحيح." }, { status: 400 });
        }

        const signed = await signOfflineLicense({ hardwareId, pharmacyName, licensedTo, expiryDays });

        const record = await prisma.offlineLicense.create({
            data: {
                pharmacyName,
                licensedTo: licensedTo || null,
                hardwareId,
                plan: signed.plan,
                expiresAt: signed.expiresAt,
                licenseCode: signed.code,
                issuedById: user.id || null,
                notes: body.notes ? String(body.notes).trim() : null,
            },
        });

        return NextResponse.json({ success: true, license: record });
    } catch (error: any) {
        console.error("[offline-licenses POST] failed:", error);
        return NextResponse.json({ error: error?.message || "تعذر توليد الترخيص." }, { status: 500 });
    }
}
