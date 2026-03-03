/**
 * Patients Hub Layout
 *
 * Wraps /dashboard/patients and its sibling pages (insurance, loyalty)
 * with a unified top tab bar.
 *
 * Tabs (2): Patients List · Loyalty Programme
 * (Insurance tab hidden: local pharmacies don't use insurance — CTO decision)
 */

import HubTabNav, { type HubTab } from "@/app/ui/hub-tab-nav";
import { UserCircle, Shield, Gift } from "lucide-react"; // Shield kept for when insurance tab is re-enabled

const TABS: HubTab[] = [
    { name: "المرضى",         href: "/dashboard/patients",  icon: <UserCircle className="w-3.5 h-3.5 shrink-0" /> },
    // { name: "التأمين",      href: "/dashboard/insurance", icon: <Shield className="w-3.5 h-3.5 shrink-0" /> },  // Hidden: local pharmacies don't use insurance (CTO)
    { name: "برنامج الولاء",   href: "/dashboard/loyalty",   icon: <Gift className="w-3.5 h-3.5 shrink-0" /> },
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
