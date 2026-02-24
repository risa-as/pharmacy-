/**
 * Patients Hub Layout
 *
 * Wraps /dashboard/patients and its sibling pages (insurance, loyalty)
 * with a unified top tab bar.
 *
 * Tabs (3): Patients List · Insurance · Loyalty Programme
 */

import HubTabNav, { type HubTab } from "@/app/ui/hub-tab-nav";
import { UserCircle, Shield, Gift } from "lucide-react";

const TABS: HubTab[] = [
    { name: "المرضى",         href: "/dashboard/patients",  icon: UserCircle },
    { name: "التأمين",         href: "/dashboard/insurance", icon: Shield },
    { name: "برنامج الولاء",   href: "/dashboard/loyalty",   icon: Gift },
];

export default function PatientsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <HubTabNav
                tabs={TABS}
                skipOnPatterns={["/create", "/edit"]}
            />
            {children}
        </>
    );
}
