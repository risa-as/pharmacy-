import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
    /**
     * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        user: {
            id: string;
            role: string;
            branchId?: string | null;
        } & DefaultSession["user"];
    }

    interface User {
        role: string;
        branchId?: string | null;
    }
}

declare module "next-auth/jwt" {
    /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
    interface JWT {
        id: string;
        role: string;
        branchId?: string | null;
    }
}
