"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn("credentials", formData, { redirectTo: '/dashboard' });
    } catch (error) {
        if (error instanceof AuthError) {
            switch ((error as AuthError).type) {
                case "CredentialsSignin":
                    return "بيانات الاعتماد غير صالحة."; // Arabic for invalid credentials
                default:
                    return "حدث خطأ غير متوقع.";
            }
        }
        throw error;
    }
}
