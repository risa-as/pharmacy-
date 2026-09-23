import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isSuperAdminRoute, isPharmacyOnlyRoute } from "@/app/lib/super-admin-guard";
import { isWarehouseRole } from "@/app/lib/warehouse-role";
import { NextResponse } from "next/server";
import { REQUEST_METHOD_HEADER, REQUEST_PATH_HEADER } from '@/app/lib/subscription-request-policy';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const { nextUrl } = req;
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

    // Current subscription is checked in Node (cookie and mobile Bearer), not
    // from an edge claim that can outlive a renewal. Overwrite spoofed headers.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(REQUEST_METHOD_HEADER, req.method);
    requestHeaders.set(REQUEST_PATH_HEADER, nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
    // Include API routes so the grace-period write-block (T022) can intercept
    // blocked operations. Static assets, image optimization, and sync routes
    // (which use raw request bodies) are excluded to avoid body-stream conflicts.
    // api/auth/login and api/auth/change-password are custom endpoints (not NextAuth
    // actions) — excluding them prevents NextAuth middleware from intercepting and
    // returning a non-JSON response instead of the route handler's response.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/sync|api/mobile/session|api/public|api/auth/login|api/auth/change-password|api/auth/refresh).*)"],
};
