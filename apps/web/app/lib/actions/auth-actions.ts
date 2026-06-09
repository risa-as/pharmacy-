"use server";

import { signOut } from "@/auth";

export async function handleSignOut() {
    await signOut({ redirectTo: '/login' });
}

// Clears the session without a server-side redirect so the client can
// do a hard navigation (window.location.href), bypassing Router Cache.
export async function clearSession() {
    try {
        await (signOut as any)({ redirect: false });
    } catch {
        // If signOut throws (e.g., NEXT_REDIRECT on some versions), the
        // session cookie is already cleared before the throw — that's enough.
    }
}
