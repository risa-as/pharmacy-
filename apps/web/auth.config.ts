import type { NextAuthConfig } from "next-auth";
import { getUserPermissions } from "@/app/lib/permissions";
import { canAccessPath } from "@/app/lib/route-permissions";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        if (!isLoggedIn) {
          return false; // Redirect to login
        }

        // Admin and Super Admin have full access (middleware handles specific isolations)
        const role = auth?.user?.role;
        if (role === "ADMIN" || role === "SUPER_ADMIN") return true;

        // Check granular permissions for non-admin users
        const user = { role: role || "CASHIER", permissions: (auth?.user as any)?.permissions };
        const perms = getUserPermissions(user);

        if (!canAccessPath(nextUrl.pathname, perms)) {
          return Response.redirect(new URL("/dashboard?denied=1", nextUrl));
        }

        return true;
      } else if (isLoggedIn) {
        // Redirect logged-in users away from login page to dashboard
        if (nextUrl.pathname === "/login") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }
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
      }
      return session;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
