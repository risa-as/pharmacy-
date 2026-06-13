export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { getSubscriptionState } from "@/app/lib/subscription-state";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, "auth-login", 10, 60_000);
    if (limited) return limited;

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: "البريد الإلكتروني وكلمة المرور مطلوبان" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { branch: { select: { organizationId: true } } },
    });

    if (!user) {
      return NextResponse.json(
        { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return NextResponse.json(
        { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    // Reject soft-disabled (departed) employees.
    if ((user as any).isActive === false) {
      return NextResponse.json(
        { message: "تم تعطيل هذا الحساب. يرجى مراجعة مدير الصيدلية." },
        { status: 403 },
      );
    }

    const organizationId = user.branch?.organizationId ?? null;

    // Block login when the organisation is suspended or past its grace window.
    // SUPER_ADMIN has no organization and is never blocked here.
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

    if (!process.env.AUTH_SECRET) {
      console.error("CRITICAL: AUTH_SECRET env var is not set");
      return NextResponse.json({ message: "خطأ في إعداد الخادم" }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId ?? null,
      organizationId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      // 7d window; the mobile app calls /api/auth/refresh on startup to renew it
      // and re-validate the account (revocation), so active users stay logged in.
      .setExpirationTime("7d")
      .sign(secret);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId || null,
      },
    });
  } catch (error) {
    console.error("Login API Error:", error);
    return NextResponse.json({ message: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
