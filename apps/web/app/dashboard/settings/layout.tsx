/**
 * Settings Hub Layout
 *
 * Wraps /dashboard/settings (General) and /dashboard/settings/billing
 * with the shared sticky tab bar. The General tab has exact-match active
 * detection because Billing is a sub-route that would otherwise make it
 * always appear active.
 */

import HubTabNav, { type HubTab } from "@/app/ui/hub-tab-nav";
import { Settings, CreditCard } from "lucide-react";

const TABS: HubTab[] = [
    { name: "الإعدادات العامة", href: "/dashboard/settings",         icon: <Settings className="w-3.5 h-3.5 shrink-0" />    },
    { name: "الاشتراك والفوترة", href: "/dashboard/settings/billing", icon: <CreditCard className="w-3.5 h-3.5 shrink-0" />  },
];

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <HubTabNav tabs={TABS} />
            {children}
        </>
    );
}
