"use client";

/**
 * upgrade-prompt.tsx
 *
 * Inline upgrade prompt displayed when a SaaS plan limit is reached.
 * Rendered by create forms when the Server Action returns limitReached: true.
 */

import Link from "next/link";
import { Crown } from "lucide-react";

interface UpgradePromptProps {
    message: string;
    current: number;
    max: number;
    /** Link to the upgrade/billing page. Defaults to /dashboard/settings */
    upgradeHref?: string;
}

export default function UpgradePrompt({
    message,
    current,
    max,
    upgradeHref = "/dashboard/settings",
}: UpgradePromptProps) {
    return (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
                <Crown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                        تم الوصول إلى حد الخطة
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                        {message}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                        الاستخدام الحالي: {current} / {max}
                    </p>
                </div>
            </div>
            <Link
                href={upgradeHref}
                className="self-start rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 transition-colors"
            >
                ترقية الخطة
            </Link>
        </div>
    );
}
