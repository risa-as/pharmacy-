export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { SignJWT, jwtVerify } from "jose";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { getSubscriptionState } from "@/app/lib/subscription-state";

// Token lifetime — kept moderate so the app still works through short offline
// stretches, while the per-refresh re-validation below provides revocation.
const TOKEN_TTL = "7d";

function getSecret(): Uint8Array {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET env var is not set");
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

/**
 * Mobile token refresh.
 *
 * Takes a still-valid Bearer token and returns a fresh one — BUT first
 * re-validates the account against current state. This is the revocation point
 * the long-lived stateless JWT lacked: a fired employee (isActive=false) or a
 * suspended organisation is rejected here on the next app open, instead of
 * staying authorised until the token naturally expires.
 *
 * An already-expired token cannot be refreshed (jwtVerify rejects it) — the user
 * must log in again. Apps should therefore refresh on startup, before expiry.
 */
export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(req, "auth-refresh", 30, 60_000);
    if (limited) return limited;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const oldToken = authHeader.slice(7);

    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(oldToken, getSecret()));
    } catch {
      return NextResponse.json(
        { message: "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً." },
        { status: 401 },
      );
    }

    const userId = payload.userId as string | undefined;
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: { select: { organizationId: true } } },
    });
    if (!user) {
      return NextResponse.json({ message: "الحساب غير موجود." }, { status: 401 });
    }

    // ── Revocation checkpoint ────────────────────────────────────────────────
    if ((user as any).isActive === false) {
      return NextResponse.json(
        { message: "تم تعطيل هذا الحساب. يرجى مراجعة مدير الصيدلية." },
        { status: 403 },
      );
    }

    const organizationId = user.branch?.organizationId ?? null;
    if (organizationId && user.role !== "SUPER_ADMIN") {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { isSuspended: true, subscriptionEndsAt: true },
      });
      if (org && getSubscriptionState(org).state === "suspended") {
        return NextResponse.json(
          { message: "تم تعليق اشتراك مؤسستكم. يرجى تجديد الاشتراك للمتابعة." },
          { status: 403 },
        );
      }
    }

    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId ?? null,
      organizationId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(getSecret());

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId ?? null,
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json({ message: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
