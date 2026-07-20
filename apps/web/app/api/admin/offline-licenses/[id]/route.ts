export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

async function requireSuperAdmin() {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    return user?.role === "SUPER_ADMIN" ? user : null;
}

// PATCH — update record-keeping fields (revoke flag / notes).
// NOTE: offline licenses are verified fully offline, so `revoked` is a
// bookkeeping status only — it does NOT disable a device that is already
// activated. Time-limited (ANNUAL) codes still expire locally via the JWT.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    if (!(await requireSuperAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    try {
        const { id } = await context.params;
        const body = await request.json();
        const data: { revoked?: boolean; notes?: string | null } = {};
        if (typeof body.revoked === "boolean") data.revoked = body.revoked;
        if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "لا توجد تغييرات." }, { status: 400 });
        }
        const license = await prisma.offlineLicense.update({ where: { id }, data });
        return NextResponse.json({ success: true, license });
    } catch (error: any) {
        console.error("[offline-licenses PATCH] failed:", error);
        return NextResponse.json({ error: error?.message || "تعذر التحديث." }, { status: 500 });
    }
}

// DELETE — remove an issued-license record from the log. Does not affect a
// device that has already activated with this code.
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    if (!(await requireSuperAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    try {
        const { id } = await context.params;
        await prisma.offlineLicense.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[offline-licenses DELETE] failed:", error);
        return NextResponse.json({ error: error?.message || "تعذر الحذف." }, { status: 500 });
    }
}
