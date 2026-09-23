import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isSuperAdminRoute, isPharmacyOnlyRoute } from "@/app/lib/super-admin-guard";
import { isBlockedInGracePeriod } from "@/app/lib/grace-period-guard";
import { isWarehouseRole } from "@/app/lib/warehouse-role";
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

    // ── Stage 1 (warehouses/B2B): identity-layer isolation ─────────────────────
    // This is the check that actually enforces "not logged in => redirect to
    // login" for /warehouse — NOT auth.config.ts's authorized() callback.
    // next-auth's handleAuth() (node_modules/next-auth/lib/index.js) only
    // short-circuits the wrapped middleware function when authorized()
    // returns a Response; a plain `false` return falls through to
    // `else if (userMiddlewareOrRoute)` and the wrapped function (this one)
    // still runs regardless. authorized() returns `false` for /warehouse for
    // symmetry/documentation only — this line, like the identical /dashboard
    // check above (same pre-existing gap), is the real gate.
    if (!req.auth && nextUrl.pathname.startsWith("/warehouse")) {
        return Response.redirect(new URL("/login", nextUrl));
    }

    // Skip root page SSR entirely for authenticated users — redirect straight to
    // the user's home (dashboard, or /warehouse for a WAREHOUSE account) via fast
    // middleware (avoids the 15+ second auth() cold-start call in app/page.tsx
    // that caused a blank white screen on first load).
    if (req.auth && nextUrl.pathname === "/") {
        const home = isWarehouseRole(role || "") ? "/warehouse" : "/dashboard";
        return Response.redirect(new URL(home, nextUrl));
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
    // subscriptionState is stored in the JWT at sign-in and refreshed from the
    // organisation on every Node-side session read (session-refresh.ts, N10); the
    // edge copy here sees the refreshed value once the session cookie is rewritten.
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
    // api/auth/login and api/auth/change-password are custom endpoints (not NextAuth
    // actions) — excluding them prevents NextAuth middleware from intercepting and
    // returning a non-JSON response instead of the route handler's response.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/sync|api/mobile|api/public|api/auth/login|api/auth/change-password|api/auth/refresh).*)"],
};
