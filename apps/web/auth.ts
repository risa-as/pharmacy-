import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/app/lib/prisma";
import { getSubscriptionState } from "@/app/lib/subscription-state";

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

                    return { ...user, subscriptionState };
                }
                return null;
            },
        }),
    ],

});
