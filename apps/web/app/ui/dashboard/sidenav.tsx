"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@faramace/ui";
import { useState, useEffect } from "react";
import {
    Home,
    Package,
    Users,
    Store,
    Pill,
    FileText,
    LogOut,
    Bell,
    BarChart3,
    ShoppingCart,
    UserCircle,
    ClipboardList,
    Building2,
    CreditCard
} from "lucide-react";

// Map of links to display in the side navigation.
const links = [
    { name: "الرئيسية", href: "/dashboard", icon: Home },
    { name: "المنظمات", href: "/dashboard/organizations", icon: Store },
    { name: "الفروع", href: "/dashboard/branches", icon: Store },
    { name: "قاعدة الأدوية", href: "/dashboard/drugs", icon: Pill },
    { name: "الموردين", href: "/dashboard/suppliers", icon: Users },
    { name: "الفواتير", href: "/dashboard/invoices", icon: FileText },
    { name: "المخزون", href: "/dashboard/inventory", icon: Package },
    { name: "المبيعات", href: "/dashboard/sales", icon: ShoppingCart },
    { name: "المستخدمين", href: "/dashboard/users", icon: Users },
    { name: "المرضى", href: "/dashboard/patients", icon: UserCircle },
    { name: "الوصفات", href: "/dashboard/prescriptions", icon: ClipboardList },
    { name: "التأمين", href: "/dashboard/insurance", icon: Building2 },
    { name: "التقارير", href: "/dashboard/reports", icon: BarChart3 },
    { name: "التنبيهات", href: "/dashboard/alerts", icon: Bell },
];

export default function SideNav() {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="flex h-full flex-col px-3 py-4 md:px-2 bg-white border-l border-gray-200">
                <div className="mb-4 h-20 md:h-40 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 animate-pulse" />
                <div className="flex grow flex-col space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-[42px] rounded-lg bg-gray-100 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col px-3 py-4 md:px-2 bg-white border-l border-gray-200">
            <Link
                className="mb-4 flex h-20 items-end justify-start rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-4 md:h-40 shadow-lg shadow-blue-500/20 transition-transform hover:scale-[1.02]"
                href="/"
            >
                <div className="w-full text-white md:w-40 flex flex-col gap-1">
                    <Store className="h-8 w-8 text-white/90" />
                    <span className="text-2xl font-bold">فاراماس</span>
                    <span className="text-xs text-blue-100 opacity-90">النظام السحابي</span>
                </div>
            </Link>
            <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2 overflow-y-auto">
                {links.map((link) => {
                    const LinkIcon = link.icon;
                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={cn(
                                "flex h-[42px] grow items-center justify-center gap-3 rounded-lg p-2 text-sm font-bold transition-all duration-200 md:flex-none md:justify-start md:px-3",
                                {
                                    "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200": pathname === link.href,
                                    "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900": pathname !== link.href,
                                },
                            )}
                        >
                            <LinkIcon className="w-5 h-5" />
                            <span className="hidden md:block">{link.name}</span>
                        </Link>
                    );
                })}
                <div className="hidden h-auto w-full grow rounded-md md:block" />
                <button
                    type="button"
                    className="flex h-[42px] w-full grow items-center justify-center gap-3 rounded-lg bg-red-50 p-2 text-sm font-bold text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors md:flex-none md:justify-start md:px-3"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="hidden md:block">تسجيل الخروج</span>
                </button>
            </div>
        </div>
    );
}
