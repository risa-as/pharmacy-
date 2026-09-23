import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/app/lib/prisma";
import { getSubscriptionState } from "@/app/lib/subscription-state";
import { refreshSessionToken, SESSION_REFRESH_UNAVAILABLE } from "@/app/lib/session-refresh";

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { branch: true },
        });
        return user;
    } catch (error) {
        console.error("Failed to fetch user:", error);
        throw new Error("Failed to fetch user.");
    }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
    ...authConfig,
    callbacks: {
        ...authConfig.callbacks,
        // Sign-in populates the token from the fresh `authorize()` row; every
        // later read re-checks the database (see session-refresh.ts). Kept out of
        // auth.config.ts because the middleware copy of that config runs on the edge.
        async jwt(params) {
            const token = await authConfig.callbacks.jwt(params);
            if (params.user) return token;
            return refreshSessionToken(token, (id) => prisma.user.findUnique({
                where: { id },
                select: { role: true, isActive: true, branchId: true, permissions: true, warehouseId: true, sessionVersion: true, branch: { select: { organizationId: true, organization: { select: { subscriptionEndsAt: true, isSuspended: true } } } } },
            }));
        },
        // An unverifiable session (database unavailable) exposes no user: every
        // `auth()` caller refuses, and tenant/warehouse helpers throw instead of
        // redirecting, while the cookie itself survives the outage.
        async session(params) {
            const session = await authConfig.callbacks.session(params as any);
            if ((params as any).token?.refreshFailed) {
                return { ...session, user: undefined, error: SESSION_REFRESH_UNAVAILABLE } as any;
            }
            return session;
        },
    },
    providers: [
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data;
                    const user = await getUser(email);
                    if (!user) return null;

                    const passwordsMatch = await bcrypt.compare(password, user.password);
                    if (!passwordsMatch) return null;

                    // Reject soft-disabled (departed) employees.
                    if ((user as any).isActive === false) return null;

                    // Compute subscription state at login time so middleware can enforce it
                    let subscriptionState = "active";
                    const orgId = user.branch?.organizationId;
                    if (orgId) {
                        try {
                            const org = await prisma.organization.findUnique({
                                where: { id: orgId },
                                select: { subscriptionEndsAt: true, isSuspended: true },
                            });
                            if (org) {
                                subscriptionState = getSubscriptionState(org).state;
                            }
                        } catch {
                            // Non-blocking — default to active
                        }
                    }

                    // `...user` is the full Prisma User row, so warehouseId /
                    // warehouseUserType (Stage 1 of the warehouses/B2B
                    // feature) ride along automatically once those columns
                    // exist — no explicit field needed here. A WAREHOUSE
                    // account has branchId = null, which `getUser()`'s
                    // `include: { branch: true }` above resolves to
                    // `branch: null` (Branch is an optional relation) rather
                    // than throwing, and `orgId` below is then `undefined`,
                    // so subscriptionState correctly stays "active" (a
                    // warehouse account has no subscription to gate on).
                    return { ...user, subscriptionState };
                }
                return null;
            },
        }),
    ],

});
