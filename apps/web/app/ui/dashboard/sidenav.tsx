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
    CreditCard,
    Truck,
    Gift,
    Smartphone,
    BookOpen,
    FileSpreadsheet,
    Settings as SettingsIcon,
    Wallet,
    ArrowRightLeft,
    Undo2,
    CheckSquare,
    Clock,
    DollarSign,
    AlertTriangle,
    Activity,
    Tag,
    ScrollText,
    TrendingUp,
    PackageMinus,
    Shield,
    Building2,
    Brain,
    Crown,
    MessageSquare,
    ShoppingBag,
} from "lucide-react";
import { handleSignOut } from "@/app/lib/actions/auth-actions";
import { type UserPermissions } from "@/app/lib/permissions";
import { getLinkPermission } from "@/app/lib/route-permissions";

interface NavSection {
    label: string;
    links: { name: string; href: string; icon: any }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MVP SIDEBAR — 11 core items (reduced from 43).
// All other pages remain fully accessible via tabs, buttons, and row-clicks
// inside their parent pages. See the Final Page Disposition Report for details.
// ─────────────────────────────────────────────────────────────────────────────
const sections: NavSection[] = [
    {
        label: "",
        links: [
            { name: "الرئيسية", href: "/dashboard", icon: Home },
        ],
    },
    {
        label: "الصيدلة",
        links: [
            { name: "قاعدة الأدوية", href: "/dashboard/drugs", icon: Pill },
            // Drug Import → accessible via "استيراد" button inside Drugs page
            { name: "الوصفات", href: "/dashboard/prescriptions", icon: ClipboardList },
        ],
    },
    {
        label: "المخزون والمبيعات",
        links: [
            // RESTORED: /dashboard/inventory was previously missing from the sidebar
            { name: "المخزون", href: "/dashboard/inventory", icon: Package },
            // Inventory sub-tools (Stocktakes, Barcode, Bulk Pricing, Transfers,
            // Shortages, Expired, Margin Warnings, Product Movement, Batches)
            // → accessible as tabs/buttons inside the Inventory page
            { name: "المبيعات", href: "/dashboard/sales", icon: ShoppingCart },
            // Invoices, Returns, Payments → tabs inside Sales page
            { name: "دفتر الديون", href: "/dashboard/debts", icon: BookOpen },
        ],
    },
    {
        label: "العملاء والتوريد",
        links: [
            { name: "المرضى", href: "/dashboard/patients", icon: UserCircle },
            // Insurance, Loyalty → tabs inside Patients page
            { name: "الموردون", href: "/dashboard/suppliers", icon: Truck },
            { name: "المشتريات", href: "/dashboard/purchases", icon: ShoppingCart },
            // CTO Override: Smart Orders stays in main nav (other supply sub-pages via row-clicks)
            { name: "الطلبات الذكية", href: "/dashboard/purchases/smart-order", icon: Brain },
        ],
    },
    {
        label: "الإدارة",
        links: [
            { name: "التقارير", href: "/dashboard/reports", icon: BarChart3 },
            // All 14 sub-reports (Sales, Profits, Inventory, Expiry, Margins,
            // Top Sellers, Slow Movers, Purchases, Employees, Shifts,
            // Audit Log, Branch Comparison, Forecast, Analytics)
            // → accessible as tabs inside the Reports hub page
        ],
    },

    // ─── FUTURE: Bucket 3 — Advanced & B2B ──────────────────────────────────
    // These sections are commented out for Day-1 MVP. Routes and code remain
    // intact. Uncomment individual items when the prerequisite conditions are met.
    //
    // {
    //     label: "التوسع والابتكار",
    //     links: [
    //         // FUTURE: Iraqi Warehouses — requires Kimadia/national warehouse API
    //         // integration. Zero value without supplier-side onboarding.
    //         // { name: "المستودعات العراقية", href: "/dashboard/warehouses", icon: Building2 },
    //
    //         // FUTURE: B2B Marketplace — cold-start problem. Page is empty until
    //         // ≥3 verified wholesale suppliers are onboarded to the platform.
    //         // { name: "سوق B2B", href: "/dashboard/marketplace", icon: ShoppingBag },
    //
    //         // FUTURE: AI Demand Forecast — ML model requires ≥60 days of real
    //         // sales history. Output is meaningless (or misleading) before that.
    //         // { name: "تنبؤ الطلب AI", href: "/dashboard/analytics/demand-forecast", icon: Brain },
    //
    //         // FUTURE: WhatsApp — requires Meta Business account verification,
    //         // approved message templates, and monthly API cost sign-off.
    //         // { name: "WhatsApp", href: "/dashboard/notifications/whatsapp", icon: MessageSquare },
    //
    //         // FUTURE: Tenant Admin — SaaS platform operator page only.
    //         // NEVER expose to pharmacy customers. Move to internal admin panel.
    //         // { name: "إدارة المؤسسات", href: "/dashboard/tenants", icon: Crown },
    //
    //         // FUTURE: Permissions Guide — developer/implementer reference doc.
    //         // Surface inside Settings → Permissions tab for ADMIN role only.
    //         // { name: "دليل الصلاحيات", href: "/dashboard/permissions-guide", icon: Shield },
    //     ],
    // },
    // ────────────────────────────────────────────────────────────────────────
];

export default function SideNav({ settings, userPermissions, userRole }: {
    settings: any;
    userPermissions?: UserPermissions | null;
    userRole?: string;
}) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Close drawer on route change
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        document.body.style.overflow = mobileOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileOpen]);

    const filteredSections = sections.map(section => {
        const visibleLinks = section.links.filter(link => {
            if (!userPermissions) return true;
            if (userRole === 'ADMIN') return true;
            const requiredPerm = getLinkPermission(link.href);
            if (!requiredPerm) return true;
            return userPermissions[requiredPerm];
        });
        return { ...section, links: visibleLinks };
    }).filter(s => s.links.length > 0);

    if (!mounted) {
        return (
            <>
                <div className="md:hidden fixed top-3 right-3 z-50">
                    <div className="w-10 h-10 rounded-xl bg-card shadow-md border animate-pulse" />
                </div>
                <div className="hidden md:flex h-full flex-col px-3 py-4 bg-background border-l border-border/80">
                    <div className="mb-4 h-32 rounded-2xl bg-gradient-to-tr from-primary to-primary/80 animate-pulse" />
                    <div className="flex grow flex-col space-y-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />
                        ))}
                    </div>
                </div>
            </>
        );
    }

    const navContent = (
        <>
            {/* Brand Header */}
            <Link
                className="mb-5 flex h-20 md:h-32 items-end justify-start rounded-2xl bg-gradient-to-tr from-primary to-primary/80 p-4 shadow-lg shadow-primary/15 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                href="/"
                onClick={() => setMobileOpen(false)}
            >
                <div className="w-full text-primary-foreground flex flex-col gap-0.5">
                    {settings?.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo" className="h-9 w-9 object-contain bg-primary-foreground/90 rounded-lg p-1 mb-1.5" />
                    ) : (
                        <Store className="h-7 w-7 text-primary-foreground/90 mb-1" />
                    )}
                    <span className="text-lg font-bold truncate leading-tight">{settings?.name || "فاراماس"}</span>
                    <span className="text-[10px] text-primary-foreground/60 font-medium">النظام السحابي</span>
                </div>
            </Link>

            {/* Navigation */}
            <nav className="flex grow flex-col overflow-y-auto space-y-1 px-0.5" style={{ scrollbarWidth: "thin" }}>
                {filteredSections.map((section, sIdx) => (
                    <div key={sIdx}>
                        {section.label && (
                            <div className="px-3 pt-4 pb-1.5 first:pt-0">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    {section.label}
                                </span>
                            </div>
                        )}
                        {section.links.map((link) => {
                            const LinkIcon = link.icon;
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                        "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
                                        {
                                            "bg-primary/10 text-primary shadow-sm": isActive,
                                            "text-muted-foreground hover:bg-muted hover:text-foreground": !isActive,
                                        },
                                    )}
                                >
                                    <LinkIcon className="w-[18px] h-[18px] shrink-0" />
                                    <span className="truncate">{link.name}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
                <div className="flex-1" />
            </nav>

            {/* ─── Settings Gear — Admin/SuperAdmin only ─── */}
            {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && (
                <div className="px-0.5 mt-1">
                    <Link
                        href="/dashboard/settings"
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                            "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
                            pathname.startsWith("/dashboard/settings") ||
                            pathname.startsWith("/dashboard/users") ||
                            pathname.startsWith("/dashboard/branches") ||
                            pathname.startsWith("/dashboard/finance") ||
                            pathname.startsWith("/dashboard/expenses") ||
                            pathname.startsWith("/dashboard/organizations") ||
                            pathname.startsWith("/dashboard/notifications")
                                ? "bg-primary/10 text-primary shadow-sm"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <SettingsIcon className="w-[18px] h-[18px] shrink-0" />
                        <span>الإعدادات</span>
                    </Link>
                </div>
            )}

            {/* Sign Out */}
            <form action={handleSignOut} className="mt-2 px-0.5">
                <button className="flex h-9 w-full items-center gap-2.5 rounded-lg bg-destructive/10 px-3 text-[13px] font-bold text-destructive hover:bg-destructive/20 transition-colors">
                    <LogOut className="w-[18px] h-[18px]" />
                    <span>تسجيل الخروج</span>
                </button>
            </form>
        </>
    );

    return (
        <>
            {/* ═══ Mobile Hamburger Button ═══ */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden fixed top-3 right-3 z-50 w-10 h-10 rounded-xl bg-card shadow-md border border-border flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                aria-label="القائمة"
            >
                {mobileOpen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                )}
            </button>

            {/* ═══ Mobile Overlay ═══ */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ═══ Mobile Drawer ═══ */}
            <div
                className={cn(
                    "md:hidden fixed top-0 right-0 z-40 h-full w-72 bg-background shadow-2xl border-l border-border flex flex-col px-3 py-4 transition-transform duration-300 ease-in-out overflow-y-auto",
                    mobileOpen ? "translate-x-0" : "translate-x-full"
                )}
                dir="rtl"
            >
                <div className="h-4" />
                {navContent}
            </div>

            {/* ═══ Desktop Sidebar ═══ */}
            <div className="hidden md:flex h-full flex-col px-3 py-4 md:px-2 bg-background border-l border-border/80">
                {navContent}
            </div>
        </>
    );
}
