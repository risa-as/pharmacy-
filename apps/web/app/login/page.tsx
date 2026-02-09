import LoginForm from "@/app/ui/login-form";
import { Command } from "lucide-react";

export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
            <div className="w-full max-w-md space-y-8 rounded-2xl bg-white/80 p-10 shadow-2xl backdrop-blur-xl ring-1 ring-gray-900/5 transition-all">

                {/* Header Section */}
                <div className="flex flex-col items-center text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
                        <Command className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 font-cairo">
                        أهلاً بك مجدداً
                    </h1>
                    <p className="mt-2 text-sm text-gray-500">
                        سجل الدخول إلى حساب فاراماس السحابي
                    </p>
                </div>

                {/* Login Form Container */}
                <div className="mt-8 space-y-6" dir="rtl">
                    <LoginForm />
                </div>

                {/* Footer */}
                <p className="px-8 text-center text-xs text-gray-400">
                    بالمتابعة، أنت توافق على <a href="#" className="underline hover:text-gray-500">شروط الخدمة</a> و <a href="#" className="underline hover:text-gray-500">سياسة الخصوصية</a>
                </p>
            </div>
        </main>
    );
}
