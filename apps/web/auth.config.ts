import type { NextAuthConfig } from "next-auth";
import { getUserPermissions } from "@/app/lib/permissions";
import { canAccessPath } from "@/app/lib/route-permissions";
import { isWarehouseRole } from "@/app/lib/warehouse-role";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role as string | undefined;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnWarehouse = nextUrl.pathname.startsWith("/warehouse");

      if (isOnWarehouse) {
        if (!isLoggedIn) {
          // NOTE: this next-auth version does not actually redirect on a
          // plain `return false` when authorized() is combined (as here)
          // with a wrapped middleware function — middleware.ts's own
          // `!req.auth && pathname.startsWith("/warehouse")` check is what
          // actually enforces this. Kept for symmetry with the /dashboard
          // case below and to document intent.
          return false; // Redirect to login
        }

        // Non-warehouse roles (ADMIN, PHARMACIST, CASHIER, SUPER_ADMIN — no
        // impersonation, see warehouse-context.ts) don't belong on /warehouse.
        if (!isWarehouseRole(role || "")) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }

        return true;
      }

      if (isOnDashboard) {
        if (!isLoggedIn) {
          return false; // Redirect to login
        }

        // WAREHOUSE accounts belong to no Organization/Branch — pharmacy
        // dashboard routes are meaningless for them (getTenantContext()
        // would 403 them anyway, since they have no branchId). Redirect to
        // their own portal before falling into the permission check below,
        // which has no WAREHOUSE case and would otherwise silently hand them
        // CASHIER's default permissions (getDefaultPermissions() falls
        // through to CASHIER_DEFAULTS for any unrecognized role).
        if (isWarehouseRole(role || "")) {
          return Response.redirect(new URL("/warehouse", nextUrl));
        }

        // Admin and Super Admin have full access (middleware handles specific isolations)
        if (role === "ADMIN" || role === "SUPER_ADMIN") return true;

        // Check granular permissions for non-admin users
        const user = { role: role || "CASHIER", permissions: (auth?.user as any)?.permissions };
        const perms = getUserPermissions(user);

        if (!canAccessPath(nextUrl.pathname, perms)) {
          return Response.redirect(new URL("/dashboard?denied=1", nextUrl));
        }

        return true;
      }
      // No edge redirect away from /login: the edge only decodes the cookie and
      // cannot tell a revoked session (sessionVersion, disabled account) from a
      // valid one, so bouncing "logged-in" users to their home created a
      // /login <-> /dashboard loop. The login form asks the server instead
      // (useSession) and forwards a still-valid session home.
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id as string;
        token.branchId = user.branchId;
        token.organizationId = (user as any).branch?.organizationId || null;
        token.permissions = (user as any).permissions || null;
        token.subscriptionState = (user as any).subscriptionState || "active";
        // Stage 1 of the warehouses/B2B feature — see warehouse-context.ts.
        // `as any` to match the existing pattern for every other field on
        // this object that isn't declared in types/auth.d.ts (organizationId,
        // permissions, subscriptionState above).
        token.warehouseId = (user as any).warehouseId || null;
        // Checked on every read by session-refresh.ts (Node only); bumping the
        // user's sessionVersion revokes this cookie.
        token.sessionVersion = (user as any).sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.branchId = token.branchId as string;
        (session.user as any).organizationId = token.organizationId || null;
        (session.user as any).permissions = token.permissions || null;
        (session.user as any).subscriptionState = token.subscriptionState || "active";
        (session.user as any).warehouseId = token.warehouseId || null;
      }
      return session;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
