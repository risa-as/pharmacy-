"use client";

/**
 * subscription-banner.tsx
 *
 * Sticky amber (warning) or red (grace) banner shown at the top of every
 * dashboard page when the subscription is approaching expiry or in grace period.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import type { SubscriptionState } from "@/app/lib/subscription-state";

interface SubscriptionBannerProps {
    state: SubscriptionState;
    daysUntilExpiry: number | null;
    graceEndsAt: Date | null;
}

/** Live countdown display for grace period (updates every second). */
function CountdownTimer({ targetDate }: { targetDate: Date }) {
    const [display, setDisplay] = useState("");

    useEffect(() => {
        function update() {
            const diff = targetDate.getTime() - Date.now();
            if (diff <= 0) {
                setDisplay("00:00:00");
                return;
            }
            const totalSec = Math.floor(diff / 1000);
            const days = Math.floor(totalSec / 86400);
            const hours = Math.floor((totalSec % 86400) / 3600)
                .toString()
                .padStart(2, "0");
            const mins = Math.floor((totalSec % 3600) / 60)
                .toString()
                .padStart(2, "0");
            const secs = (totalSec % 60).toString().padStart(2, "0");
            setDisplay(`${days} أيام : ${hours}:${mins}:${secs}`);
        }
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [targetDate]);

    return <span className="font-mono font-bold">{display}</span>;
}

export default function SubscriptionBanner({
    state,
    daysUntilExpiry,
    graceEndsAt,
}: SubscriptionBannerProps) {
    const [dismissed, setDismissed] = useState(false);

    // Restore dismiss preference from sessionStorage
    useEffect(() => {
        if (state === "warning" && sessionStorage.getItem("sub-banner-dismissed") === "1") {
            setDismissed(true);
        }
    }, [state]);

    if (state !== "warning" && state !== "grace") return null;
    if (state === "warning" && dismissed) return null;

    const isWarning = state === "warning";

    return (
        <div
            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b ${
                isWarning
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
            }`}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {isWarning ? (
                    <span>
                        تنتهي اشتراكك خلال{" "}
                        <strong>{daysUntilExpiry} أيام</strong> — جدد الآن.
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 flex-wrap">
                        <strong>يتوقف النظام خلال:</strong>
                        {graceEndsAt && <CountdownTimer targetDate={graceEndsAt} />}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <Link
                    href="/dashboard/settings"
                    className={`rounded-md px-3 py-1 text-xs font-bold border transition-colors ${
                        isWarning
                            ? "border-amber-600 text-amber-700 hover:bg-amber-600 hover:text-white dark:border-amber-400 dark:text-amber-300"
                            : "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    }`}
                >
                    جدد الاشتراك
                </Link>
                {isWarning && (
                    <button
                        onClick={() => {
                            sessionStorage.setItem("sub-banner-dismissed", "1");
                            setDismissed(true);
                        }}
                        className="text-amber-600 hover:text-amber-800 dark:text-amber-400"
                        aria-label="إخفاء"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
