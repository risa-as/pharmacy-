/**
 * Sales Hub Layout
 *
 * Wraps /dashboard/sales and its sibling pages (invoices, returns, payments)
 * with a single top tab bar, replacing their former standalone sidebar entries.
 *
 * Tabs (4): Sales List · Invoices · Returns · Payments
 */

import HubTabNav, { type HubTab } from "@/app/ui/hub-tab-nav";
import { ShoppingCart, FileText, Undo2, CreditCard } from "lucide-react";

const TABS: HubTab[] = [
    { name: "المبيعات",   href: "/dashboard/sales",     icon: ShoppingCart },
    { name: "الفواتير",   href: "/dashboard/invoices",  icon: FileText },
    { name: "المرتجعات",  href: "/dashboard/returns",   icon: Undo2 },
    { name: "المدفوعات",  href: "/dashboard/payments",  icon: CreditCard },
];

export default function SalesLayout({
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
