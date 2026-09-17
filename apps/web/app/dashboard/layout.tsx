import SideNav from "@/app/ui/dashboard/sidenav";
import { getCompanySettings } from "@/app/lib/actions/settings";
import { auth } from "@/auth";
import { getUserPermissions } from "@/app/lib/permissions";
import { getSubscriptionState } from "@/app/lib/subscription-state";
import SubscriptionBanner from "@/app/ui/dashboard/subscription-banner";
import OverlayManager from "@/app/ui/dashboard/overlay-manager";
import { prisma } from "@/app/lib/prisma";
import WarehouseNotifications from '@/app/ui/warehouse-notifications';

import DashboardClientWidgets from "../ui/dashboard/client-widgets";

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
    let settings = null;
    let userPermissions = null;
    let userRole: string | undefined;
    let branchId: string | undefined;
    let userEmail: string | undefined;
    let userName: string | null | undefined;

    try {
        settings = await getCompanySettings();
    } catch (e) {
        console.error("[Layout] Failed to load settings:", e);
    }

    try {
        const session = await auth();
        const user = session?.user as { role: string; permissions?: string | null; branchId?: string; email?: string; name?: string | null } | undefined;
        userPermissions = user ? getUserPermissions(user) : null;
        userRole = user?.role;
        branchId = user?.branchId;
        userEmail = user?.email;
        userName = user?.name;
    } catch (e) {
        console.error("[Layout] Failed to load session:", e);
    }

    let subscriptionResult = getSubscriptionState({ subscriptionEndsAt: null, isSuspended: false });
    try {
        if (branchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: { organization: { select: { isSuspended: true, subscriptionEndsAt: true } } },
            });
            if (branch?.organization) {
                subscriptionResult = getSubscriptionState({
                    subscriptionEndsAt: branch.organization.subscriptionEndsAt ?? null,
                    isSuspended: branch.organization.isSuspended,
                });
            }
        }
    } catch (e) {
        console.error("[Layout] Failed to load subscription state:", e);
    }

    const isSuspended = subscriptionResult.state === "suspended";

    return (
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
            <DashboardClientWidgets showAssistant={userRole === 'ADMIN'} />
            {/* Desktop sidebar takes layout space; SideNav also renders mobile drawer with fixed positioning */}
            <div className="hidden md:block w-full flex-none md:w-64 print:hidden">
                <SideNav settings={settings} userPermissions={userPermissions} userRole={userRole} userEmail={userEmail} userName={userName} />
            </div>
            {/* Mobile: SideNav renders hamburger + drawer using fixed positioning */}
            <div className="md:hidden print:hidden">
                <SideNav settings={settings} userPermissions={userPermissions} userRole={userRole} userEmail={userEmail} userName={userName} />
            </div>
            <div className="flex-grow pt-14 md:pt-0 overflow-y-auto bg-muted/60 dark:bg-background print:overflow-visible print:pt-0" dir="rtl">
                {/* Subscription banner (warning/grace states) */}
                <SubscriptionBanner
                    state={subscriptionResult.state}
                    daysUntilExpiry={subscriptionResult.daysUntilExpiry}
                    graceEndsAt={subscriptionResult.graceEndsAt}
                />
                {/* Top bar: warehouse notifications. The theme toggle moved into the
                    sidebar footer to match WarehouseSideNav; the bar is now gated so
                    it does not render as an empty bordered strip without it. */}
                {userPermissions?.canCreatePurchase && (
                    <div className="flex justify-end gap-3 px-4 md:px-6 lg:px-12 py-2 border-b border-border print:hidden">
                        <WarehouseNotifications />
                    </div>
                )}
                {/* Page content — always rendered for read-only access even when suspended */}
                <div className="relative">
                    <OverlayManager isSuspended={isSuspended} />
                    <div className="p-4 md:p-6 lg:p-12">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
