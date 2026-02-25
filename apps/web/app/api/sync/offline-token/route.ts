import { NextRequest, NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_OFFLINE_DAYS = 14;
const GRACE_PERIOD_DAYS = 5;

/**
 * GET /api/sync/offline-token
 *
 * Issues a server-signed RS256 JWT that the Electron desktop app stores
 * locally and verifies offline to enforce subscription state without a
 * network call. Called by sync.ts after every successful check-in.
 *
 * Auth: branchId + licenseKey query params (matches existing sync API pattern).
 *
 * Env: OFFLINE_TOKEN_PRIVATE_KEY must contain a PEM-encoded RSA-2048 private key.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const licenseKey = searchParams.get("licenseKey");

    if (!branchId || !licenseKey) {
        return NextResponse.json(
            { error: "branchId and licenseKey are required" },
            { status: 400 }
        );
    }

    // Verify the license is active and belongs to this branch
    const license = await prisma.deviceLicense.findFirst({
        where: {
            branchId,
            licenseKey,
            isActive: true,
        },
        include: {
            branch: {
                include: { organization: true },
            },
        },
    });

    if (!license) {
        return NextResponse.json({ error: "Invalid or inactive license" }, { status: 403 });
    }

    const org = license.branch.organization;

    // Compute grace period end date
    const subscriptionEndsAt = (org as any).subscriptionEndsAt as Date | null ?? null;
    const isSuspended = (org as any).isSuspended as boolean ?? false;
    const gracePeriodEndsAt = subscriptionEndsAt
        ? new Date(subscriptionEndsAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
        : null;

    // Build JWT payload
    const payload = {
        organizationId: org.id,
        subscriptionEndsAt: subscriptionEndsAt?.toISOString() ?? null,
        gracePeriodEndsAt: gracePeriodEndsAt?.toISOString() ?? null,
        isSuspended,
        issuedAt: new Date().toISOString(),
        maxOfflineDays: MAX_OFFLINE_DAYS,
    };

    // Sign with RS256 private key from environment
    const privateKeyPem = process.env.OFFLINE_TOKEN_PRIVATE_KEY;
    if (!privateKeyPem) {
        console.warn("[OfflineToken] OFFLINE_TOKEN_PRIVATE_KEY not set — skipping JWT signing.");
        return NextResponse.json({ error: "Offline token signing not configured" }, { status: 503 });
    }

    try {
        const privateKey = await importPKCS8(privateKeyPem, "RS256");
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: "RS256" })
            .setIssuedAt()
            .setExpirationTime(`${MAX_OFFLINE_DAYS + 1}d`) // 1-day buffer after max offline
            .sign(privateKey);

        return NextResponse.json({ token });
    } catch (err: any) {
        console.error("[OfflineToken] Failed to sign JWT:", err);
        return NextResponse.json({ error: "Failed to sign offline token" }, { status: 500 });
    }
}
