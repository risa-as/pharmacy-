"use client";

import { usePathname } from "next/navigation";
import SuspendedOverlay from "./suspended-overlay";

/**
 * Routes a suspended tenant may freely access to resolve their suspension.
 * Prefix-matched: /dashboard/debts covers /dashboard/debts/[id] etc.
 */
const SUSPENSION_WHITELIST = [
    "/dashboard/settings/billing",
    "/dashboard/debts",
];

interface OverlayManagerProps {
    isSuspended: boolean;
}

export default function OverlayManager({ isSuspended }: OverlayManagerProps) {
    const pathname = usePathname();

    if (!isSuspended) return null;

    const isWhitelisted = !!pathname && SUSPENSION_WHITELIST.some(
        (route: any) => pathname === route || pathname.startsWith(route + "/")
    );

    if (isWhitelisted) return null;

    return <SuspendedOverlay />;
}
