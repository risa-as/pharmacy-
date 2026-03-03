"use client";

/**
 * suspended-overlay.tsx
 *
 * Full-screen overlay shown when the organisation's subscription is suspended.
 * Children (historical data pages) still render beneath it, making the system
 * effectively read-only per spec FR-021.
 */

import Link from "next/link";
import { ShieldAlert, FileText } from "lucide-react";

export default function SuspendedOverlay() {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md">
            <div className="max-w-md w-full mx-4 flex flex-col items-center gap-6 text-center">
                {/* Icon */}
                <div className="rounded-full bg-destructive/10 p-5">
                    <ShieldAlert className="w-12 h-12 text-destructive" />
                </div>

                {/* Heading */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        الاشتراك موقوف
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        تم إيقاف اشتراك منظمتك. يمكنك الاطلاع على البيانات السابقة بوضع
                        القراءة فقط، لكن لا يمكن إجراء أي عمليات جديدة حتى يتم تجديد
                        الاشتراك.
                    </p>
                </div>

                {/* Alert box */}
                <div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive text-right">
                    وضع القراءة فقط — مشاهدة البيانات التاريخية متاحة.
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <Link
                        href="/dashboard/debts"
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        تصدير دفتر الديون
                    </Link>
                    <Link
                        href="/dashboard/settings/billing"
                        className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors text-center"
                    >
                        جدد الاشتراك
                    </Link>
                </div>
            </div>
        </div>
    );
}
