"use client";

import { useState } from "react";
import { authenticate } from "@/app/lib/actions";
import { Button } from "@faramace/ui";
import { Mail, Lock, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";

export default function LoginForm() {
    const [error, setError] = useState<string | undefined>();
    const [pending, setPending] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (pending) return;

        setPending(true);
        setError(undefined);

        const formData = new FormData(e.currentTarget);
        const result = await authenticate(undefined, formData);

        if (result === '__LOGIN_SUCCESS__') {
            // Hard navigation bypasses Next.js Router Cache so a newly logged-in
            // user never sees stale data from a previous session.
            window.location.href = '/dashboard';
            return;
        }

        setError(result);
        setPending(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex-1">
                <h1 className="mb-6 text-2xl font-bold text-foreground text-center font-cairo">
                    تسجيل الدخول
                </h1>
                <div className="w-full space-y-4">
                    <div>
                        <label
                            className="mb-2 block text-sm font-medium text-foreground"
                            htmlFor="email"
                        >
                            البريد الإلكتروني
                        </label>
                        <div className="relative">
                            <input
                                className="peer block w-full rounded-xl border border-border py-[12px] pr-10 pl-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring transition-all bg-background text-foreground"
                                id="email"
                                type="email"
                                name="email"
                                placeholder="name@example.com"
                                required
                                dir="ltr"
                                disabled={pending}
                            />
                            <Mail className="pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground peer-focus:text-primary transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label
                            className="mb-2 block text-sm font-medium text-foreground"
                            htmlFor="password"
                        >
                            كلمة المرور
                        </label>
                        <div className="relative">
                            <input
                                className="peer block w-full rounded-xl border border-border py-[12px] pr-10 pl-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring transition-all bg-background text-foreground"
                                id="password"
                                type="password"
                                name="password"
                                placeholder="••••••••"
                                required
                                minLength={6}
                                dir="ltr"
                                disabled={pending}
                            />
                            <Lock className="pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground peer-focus:text-primary transition-colors" />
                        </div>
                    </div>
                </div>

                <Button
                    type="submit"
                    disabled={pending}
                    className="mt-6 w-full h-11 text-base font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all shadow-lg shadow-primary/30"
                >
                    {pending ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>جاري الدخول...</span>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-2">
                            <span>تسجيل الدخول</span>
                            <ArrowLeft className="w-4 h-4" />
                        </div>
                    )}
                </Button>

                <div
                    className="flex h-8 items-end space-x-1 mt-2"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {error && (
                        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-destructive w-full animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="h-5 w-5" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}
                </div>
            </div>
        </form>
    );
}
