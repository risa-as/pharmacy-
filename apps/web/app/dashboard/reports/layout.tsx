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
    { name: "النظرة العامة",      href: "/dashboard/reports",                    icon: <BarChart3 className="w-3.5 h-3.5 shrink-0" /> },
    { name: "المبيعات",           href: "/dashboard/reports/sales",              icon: <ShoppingCart className="w-3.5 h-3.5 shrink-0" /> },
    { name: "الأرباح",            href: "/dashboard/reports/profits",            icon: <TrendingUp className="w-3.5 h-3.5 shrink-0" /> },
    { name: "المخزون",            href: "/dashboard/reports/inventory",          icon: <Package className="w-3.5 h-3.5 shrink-0" /> },
    { name: "هامش الربح",        href: "/dashboard/reports/margins",            icon: <DollarSign className="w-3.5 h-3.5 shrink-0" /> },
    { name: "الصلاحية",           href: "/dashboard/reports/expiry",             icon: <CalendarX className="w-3.5 h-3.5 shrink-0" /> },
    { name: "الأكثر مبيعاً",     href: "/dashboard/reports/top-sellers",        icon: <Star className="w-3.5 h-3.5 shrink-0" /> },
    { name: "البطيئة الحركة",     href: "/dashboard/reports/slow-movers",        icon: <TrendingDown className="w-3.5 h-3.5 shrink-0" /> },
    { name: "المشتريات",          href: "/dashboard/reports/purchases",          icon: <Truck className="w-3.5 h-3.5 shrink-0" /> },
    { name: "الموظفون",           href: "/dashboard/reports/employees",          icon: <Users className="w-3.5 h-3.5 shrink-0" /> },
    { name: "الورديات",           href: "/dashboard/reports/shifts",             icon: <Clock className="w-3.5 h-3.5 shrink-0" /> },
    { name: "سجل النشاطات",      href: "/dashboard/reports/audit-log",          icon: <ScrollText className="w-3.5 h-3.5 shrink-0" /> },
    { name: "مقارنة الفروع",     href: "/dashboard/reports/branch-comparison",  icon: <GitCompareArrows className="w-3.5 h-3.5 shrink-0" /> },
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
