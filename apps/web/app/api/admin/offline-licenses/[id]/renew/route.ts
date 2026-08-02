export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { signOfflineLicense } from "@/app/lib/offline-license";

async function requireSuperAdmin() {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    return user?.role === "SUPER_ADMIN" ? user : null;
}

/**
 * POST — renew an offline license: re-sign a NEW code for the SAME device
 * fingerprint with a later expiry, and update the record in place.
 *
 * Offline codes are verified locally on the customer's machine with zero server
 * calls, so the expiry lives inside the signed JWT. There is no way to extend a
 * customer without handing them a freshly signed code — editing `expiresAt` on
 * the row alone would only change our bookkeeping while their app still locks
 * on the original date. The returned `licenseCode` must be sent to the customer.
 *
 * Body: { expiresAt: ISO string | null }  — null → perpetual.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const user = await requireSuperAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    try {
        const { id } = await context.params;
        const body = await request.json();

        const existing = await prisma.offlineLicense.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "الترخيص غير موجود." }, { status: 404 });
        }

        // null / "" → perpetual, otherwise an absolute date that must be valid
        // and in the future (a past date would sign an already-dead code).
        let newExpiry: Date | null = null;
        if (body.expiresAt !== null && body.expiresAt !== undefined && body.expiresAt !== "") {
            const parsed = new Date(String(body.expiresAt));
            if (Number.isNaN(parsed.getTime())) {
                return NextResponse.json({ error: "تاريخ الانتهاء غير صالح." }, { status: 400 });
            }
            if (parsed.getTime() <= Date.now()) {
                return NextResponse.json(
                    { error: "تاريخ الانتهاء يجب أن يكون في المستقبل." },
                    { status: 400 }
                );
            }
            newExpiry = parsed;
        }

        const signed = await signOfflineLicense({
            hardwareId: existing.hardwareId,
            pharmacyName: existing.pharmacyName,
            licensedTo: existing.licensedTo || undefined,
            expiresAt: newExpiry,
        });

        // The row keeps its identity (same pharmacy, same device) but createdAt
        // now predates the code it holds, so record the renewal in the notes.
        const stamp = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Baghdad",
            year: "numeric", month: "2-digit", day: "2-digit",
        });
        const until = signed.expiresAt ? stamp.format(signed.expiresAt) : "دائم";
        const renewalNote = `جُدد ${stamp.format(new Date())} حتى ${until}`;
        const notes = existing.notes ? `${existing.notes} | ${renewalNote}` : renewalNote;

        const license = await prisma.offlineLicense.update({
            where: { id },
            data: {
                plan: signed.plan,
                expiresAt: signed.expiresAt,
                licenseCode: signed.code,
                issuedById: user.id || null,
                revoked: false, // a freshly signed code contradicts a ملغى row
                notes,
            },
        });

        return NextResponse.json({ success: true, license });
    } catch (error: any) {
        console.error("[offline-licenses renew] failed:", error);
        return NextResponse.json({ error: error?.message || "تعذر تجديد الترخيص." }, { status: 500 });
    }
}
