"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn("credentials", formData);
    } catch (error) {
        // NEXT_REDIRECT digest means signIn succeeded — session cookie is set.
        // We intercept it here and return a sentinel so the client can do a
        // hard navigation (window.location.href) instead of a soft push,
        // which bypasses the Router Cache and prevents stale data from a
        // previous session being shown.
        if ((error as any)?.digest?.startsWith('NEXT_REDIRECT')) {
            return '__LOGIN_SUCCESS__';
        }
        if (error instanceof AuthError) {
            switch ((error as AuthError).type) {
                case "CredentialsSignin":
                    return "بيانات الاعتماد غير صالحة.";
                default:
                    return "حدث خطأ غير متوقع.";
            }
        }
        throw error;
    }
}
