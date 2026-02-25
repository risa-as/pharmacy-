import SideNav from "@/app/ui/dashboard/sidenav";
import { getCompanySettings } from "@/app/lib/actions/settings";
import { auth } from "@/auth";
import { getUserPermissions } from "@/app/lib/permissions";
import { ThemeToggle } from "@/app/ui/theme-toggle";
import { getSubscriptionState } from "@/app/lib/subscription-state";
import SubscriptionBanner from "@/app/ui/dashboard/subscription-banner";
import SuspendedOverlay from "@/app/ui/dashboard/suspended-overlay";
import { prisma } from "@/app/lib/prisma";

import dynamic from "next/dynamic";

const ElectronSessionSync = dynamic(() => import("../ui/electron-session-sync"), { ssr: false });

export default async function Layout({ children }: { children: React.ReactNode }) {
    let settings = null;
    let userPermissions = null;
    let userRole: string | undefined;

    try {
        settings = await getCompanySettings();
    } catch (e) {
        console.error("[Layout] Failed to load settings:", e);
    }

    try {
        const session = await auth();
        const user = session?.user as { role: string; permissions?: string | null } | undefined;
        userPermissions = user ? getUserPermissions(user) : null;
        userRole = user?.role;
    } catch (e) {
        console.error("[Layout] Failed to load session:", e);
    }

    // Fetch subscription state from the active Tenant record.
    // TODO: link Organization → tenantId so each org maps to its own Tenant plan.
    let subscriptionResult = getSubscriptionState({ subscriptionEndsAt: null, isSuspended: false });
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { isActive: true },
            select: { subscriptionEndsAt: true, isSuspended: true },
        });
        if (tenant) {
            subscriptionResult = getSubscriptionState({
                subscriptionEndsAt: tenant.subscriptionEndsAt,
                isSuspended: tenant.isSuspended,
            });
        }
    } catch (e) {
        console.error("[Layout] Failed to load subscription state:", e);
    }

    const isSuspended = subscriptionResult.state === "suspended";

    return (
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
            <ElectronSessionSync />
            {/* Desktop sidebar takes layout space; SideNav also renders mobile drawer with fixed positioning */}
            <div className="hidden md:block w-full flex-none md:w-64">
                <SideNav settings={settings} userPermissions={userPermissions} userRole={userRole} />
            </div>
            {/* Mobile: SideNav renders hamburger + drawer using fixed positioning */}
            <div className="md:hidden">
                <SideNav settings={settings} userPermissions={userPermissions} userRole={userRole} />
            </div>
            <div className="flex-grow pt-14 md:pt-0 overflow-y-auto bg-background" dir="rtl">
                {/* Subscription banner (warning/grace states) */}
                <SubscriptionBanner
                    state={subscriptionResult.state}
                    daysUntilExpiry={subscriptionResult.daysUntilExpiry}
                    graceEndsAt={subscriptionResult.graceEndsAt}
                />
                {/* Top bar: theme toggle */}
                <div className="flex justify-end px-4 md:px-6 lg:px-12 py-2 border-b border-border">
                    <ThemeToggle />
                </div>
                {/* Page content — always rendered for read-only access even when suspended */}
                <div className="relative">
                    {isSuspended && <SuspendedOverlay />}
                    <div className="p-4 md:p-6 lg:p-12">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
