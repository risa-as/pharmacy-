/**
 * Reports Hub Layout
 *
 * Wraps /dashboard/reports and ALL sub-report pages with a sticky tab strip.
 * This replaces the 5 standalone sidebar entries (profit, branch-comparison,
 * employees, audit-log, shifts) and surfaces the 9 previously orphaned
 * sub-reports (sales, profits, inventory, margins, expiry, top-sellers,
 * slow-movers, purchases, forecast) — all now reachable from one place.
 *
 * Tabs (13): Overview · Sales · Profits · Inventory · Margins · Expiry ·
 *            Top Sellers · Slow Movers · Purchases · Employees · Shifts ·
 *            Audit Log · Branch Comparison
 */

import HubTabNav, { type HubTab } from "@/app/ui/hub-tab-nav";
import {
    BarChart3,
    ShoppingCart,
    TrendingUp,
    Package,
    DollarSign,
    CalendarX,
    Star,
    TrendingDown,
    Truck,
    Users,
    Clock,
    ScrollText,
    GitCompareArrows,
} from "lucide-react";

const TABS: HubTab[] = [
    { name: "النظرة العامة",      href: "/dashboard/reports",                    icon: BarChart3 },
    { name: "المبيعات",           href: "/dashboard/reports/sales",              icon: ShoppingCart },
    { name: "الأرباح",            href: "/dashboard/reports/profits",            icon: TrendingUp },
    { name: "المخزون",            href: "/dashboard/reports/inventory",          icon: Package },
    { name: "هامش الربح",        href: "/dashboard/reports/margins",            icon: DollarSign },
    { name: "الصلاحية",           href: "/dashboard/reports/expiry",             icon: CalendarX },
    { name: "الأكثر مبيعاً",     href: "/dashboard/reports/top-sellers",        icon: Star },
    { name: "البطيئة الحركة",     href: "/dashboard/reports/slow-movers",        icon: TrendingDown },
    { name: "المشتريات",          href: "/dashboard/reports/purchases",          icon: Truck },
    { name: "الموظفون",           href: "/dashboard/reports/employees",          icon: Users },
    { name: "الورديات",           href: "/dashboard/reports/shifts",             icon: Clock },
    { name: "سجل النشاطات",      href: "/dashboard/reports/audit-log",          icon: ScrollText },
    { name: "مقارنة الفروع",     href: "/dashboard/reports/branch-comparison",  icon: GitCompareArrows },
];

export default function ReportsLayout({
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
