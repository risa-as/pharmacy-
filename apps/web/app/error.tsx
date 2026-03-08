"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[Root Error]", error);
    }, [error]);

    const isDbError =
        error.message?.includes("Can't reach database") ||
        error.message?.includes("PrismaClient") ||
        error.message?.includes("DATABASE_URL");

    return (
        <div className="flex min-h-screen items-center justify-center p-6" dir="rtl">
            <div className="bg-card border border-border rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-destructive" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground mb-2">
                        {isDbError ? "تعذر الاتصال بقاعدة البيانات" : "حدث خطأ غير متوقع"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {isDbError
                            ? "تأكد من أن خدمة قاعدة البيانات تعمل، ثم أعد المحاولة."
                            : "حدث خطأ أثناء تحميل الصفحة. يرجى إعادة المحاولة."}
                    </p>
                </div>
                <button
                    onClick={reset}
                    className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold transition-colors"
                >
                    <RotateCcw className="w-4 h-4" />
                    إعادة المحاولة
                </button>
                {error.digest && (
                    <p className="text-xs text-muted-foreground/50 font-mono">Error ID: {error.digest}</p>
                )}
            </div>
        </div>
    );
}
