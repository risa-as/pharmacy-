'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Dashboard Error]', error);
    }, [error]);

    const isDbError = error.message?.includes("Can't reach database server") ||
        error.message?.includes('PrismaClient');

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-6" dir="rtl">
            <div className="bg-card border border-border rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-destructive" />
                </div>

                <div>
                    <h2 className="text-xl font-bold text-foreground mb-2">
                        {isDbError ? 'تعذر الاتصال بقاعدة البيانات' : 'حدث خطأ غير متوقع'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {isDbError
                            ? 'تأكد من أن خدمة قاعدة البيانات تعمل وأن الاتصال بالإنترنت فعّال، ثم أعد المحاولة.'
                            : 'حدث خطأ أثناء تحميل الصفحة. يرجى إعادة المحاولة.'}
                    </p>
                </div>

                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-sm font-medium transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        إعادة المحاولة
                    </button>
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-sm font-medium transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        الرئيسية
                    </Link>
                </div>

                {error.digest && (
                    <p className="text-xs text-muted-foreground/50 font-mono">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
