import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isSuperAdminRoute, isPharmacyOnlyRoute } from "@/app/lib/super-admin-guard";
import { isBlockedInGracePeriod } from "@/app/lib/grace-period-guard";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const { nextUrl } = req;
    const method = req.method;
    const role = (req.auth?.user as any)?.role as string | undefined;

    // ── US1: SUPER_ADMIN isolation ────────────────────────────────────────────
    // Ensure all dashboard routes require authentication
    if (!req.auth && nextUrl.pathname.startsWith("/dashboard")) {
        return Response.redirect(new URL("/login", nextUrl));
    }

    // Skip root page SSR entirely for authenticated users — redirect straight to
    // dashboard via fast middleware (avoids the 15+ second auth() cold-start call
    // in app/page.tsx that caused a blank white screen on first load).
    if (req.auth && nextUrl.pathname === "/") {
        return Response.redirect(new URL("/dashboard", nextUrl));
    }

    // SUPER_ADMIN must not access pharmacy operations routes
    if (role === "SUPER_ADMIN" && isPharmacyOnlyRoute(nextUrl.pathname)) {
        return Response.redirect(new URL("/dashboard", nextUrl));
    }

    // Pharmacy roles must not access SUPER_ADMIN control tower routes
    if (role !== "SUPER_ADMIN" && isSuperAdminRoute(nextUrl.pathname)) {
        return Response.redirect(new URL("/dashboard", nextUrl));
    }

    // ── US4: Grace period write-blocking ─────────────────────────────────────
    // subscriptionState is stored in the JWT by auth.ts (populated on sign-in).
    // Only API routes need to be blocked here; UI forms are gated by the overlay.
    const subscriptionState = (req.auth?.user as any)?.subscriptionState as string | undefined;
    if (subscriptionState === "grace" && isBlockedInGracePeriod(nextUrl.pathname, method ?? "GET")) {
        return NextResponse.json(
            {
                gracePeriodActive: true,
                message:
                    "الإجراءات الإدارية محدودة خلال فترة السماح. يرجى تجديد الاشتراك.",
            },
            { status: 403 }
        );
    }
});

export const config = {
    // Include API routes so the grace-period write-block (T022) can intercept
    // blocked operations. Static assets, image optimization, and sync routes
    // (which use raw request bodies) are excluded to avoid body-stream conflicts.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|api/sync|api/mobile|api/public).*)"],
};
