"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
    return (
        <html>
            <body>
                <div className="flex min-h-screen items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold">500</h1>
                        <p className="mt-2">حدث خطأ غير متوقع</p>
                        <button onClick={reset} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded">
                            حاول مجدداً
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
