"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@faramace/ui";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
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
  ChevronDown,
  Lock,
  Loader2,
} from "lucide-react";

import { handleSignOut } from "@/app/lib/actions/auth-actions";
import { type UserPermissions } from "@/app/lib/permissions";
import { getLinkPermission } from "@/app/lib/route-permissions";

interface NavLink {
  name: string;
  href: string;
  icon: any;
  /** 'pro' or 'enterprise' — shows a lock badge and keeps the link so UpgradeRequired page is shown */
  plan?: "pro" | "enterprise";
  subLinks?: {
    name: string;
    href: string;
    activeFor?: string[];
    excludeFor?: string[];
    plan?: "pro" | "enterprise";
  }[];
}

interface NavSection {
  label: string;
  links: NavLink[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPER_ADMIN Control Tower — platform operator nav (tenant management only).
// Shown exclusively when userRole === 'SUPER_ADMIN'.
// ─────────────────────────────────────────────────────────────────────────────
const controlTowerSections: NavSection[] = [
  {
    label: "",
    links: [{ name: "نظرة عامة", href: "/dashboard", icon: BarChart3 }],
  },
  {
    label: "",
    links: [
      { name: "المؤسسات", href: "/dashboard/admin/tenants", icon: Building2 },
    ],
  },
  {
    label: "",
    links: [
      { name: "الباقات", href: "/dashboard/admin/plans", icon: CreditCard },
    ],
  },
  {
    label: "",
    links: [
      { name: "التراخيص", href: "/dashboard/admin/licenses", icon: Crown },
    ],
  },
  {
    label: "",
    links: [
      { name: "قاعدة الأدوية العالمية", href: "/dashboard/admin/drugs", icon: Pill },
    ],
  },
  {
    label: "",
    links: [
      { name: "الإعدادات", href: "/dashboard/settings", icon: SettingsIcon },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MVP SIDEBAR — 11 core items (reduced from 43).
// All other pages remain fully accessible via tabs, buttons, and row-clicks
// inside their parent pages. See the Final Page Disposition Report for details.
// ─────────────────────────────────────────────────────────────────────────────
const sections: NavSection[] = [
  {
    label: "",
    links: [{ name: "الرئيسية", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "",
    links: [
      {
        name: "الصيدلة",
        href: "#",
        icon: Pill,
        subLinks: [
          { name: "قاعدة الأدوية", href: "/dashboard/drugs" },
          // Drug Import → accessible via "استيراد" button inside Drugs page
          { name: "الوصفات", href: "/dashboard/prescriptions" },
          { name: "الدفعات", href: "/dashboard/batches" },
        ],
      },
    ],
  },
  {
    label: "",
    links: [
      {
        name: "المخزون والمبيعات",
        href: "#",
        icon: ShoppingCart,
        subLinks: [
          {
            name: "المخزون",
            href: "/dashboard/inventory",
            excludeFor: ["/dashboard/inventory/product-movement"],
          },
          {
            name: "المبيعات",
            href: "/dashboard/sales",
            activeFor: [
              "/dashboard/invoices",
              "/dashboard/returns",
              "/dashboard/payments",
            ],
          },
          // { name: "نقطة البيع (مؤقت)", href: "/dashboard/pos-temp" },
          { name: "دفتر الديون", href: "/dashboard/debts" },
          {
            name: "حركة المنتجات",
            href: "/dashboard/inventory/product-movement",
            plan: "pro",
          },
          {
            name: "تحويلات بين الفروع",
            href: "/dashboard/inventory/transfers",
            plan: "enterprise",
          },
        ],
      },
    ],
  },
  {
    label: "",
    links: [
      {
        name: "العملاء والتوريد",
        href: "#",
        icon: Users,
        subLinks: [
          {
            name: "المرضى",
            href: "/dashboard/patients",
            activeFor: ["/dashboard/loyalty"],
          },
          { name: "الموردون", href: "/dashboard/suppliers" },
          {
            name: "المشتريات",
            href: "/dashboard/purchases",
            excludeFor: ["/dashboard/purchases/smart-order"],
          },
          { name: "الطلبات الذكية", href: "/dashboard/purchases/smart-order" },
          {
            name: "إدارة المستودعات",
            href: "/dashboard/warehouses",
            plan: "enterprise",
          },
          {
            name: "سوق الأدوية",
            href: "/dashboard/marketplace",
            plan: "enterprise",
          },
        ],
      },
    ],
  },
  {
    label: "",
    links: [
      {
        name: "الإدارة",
        href: "#",
        icon: BarChart3,
        subLinks: [
          {
            name: "التقارير",
            href: "/dashboard/reports",
            excludeFor: [
              "/dashboard/reports/analytics",
              "/dashboard/reports/branch-comparison",
            ],
          },
          {
            name: "التقارير المتقدمة",
            href: "/dashboard/reports/analytics",
            plan: "enterprise",
          },
          {
            name: "مقارنة الفروع",
            href: "/dashboard/reports/branch-comparison",
            plan: "enterprise",
          },
          { name: "المصاريف", href: "/dashboard/expenses" },
          {
            name: "الفريق",
            href: "/dashboard/users",
            excludeFor: ["/dashboard/users/permissions"],
          },
          {
            name: "الصلاحيات",
            href: "/dashboard/users/permissions",
            plan: "pro",
          },
          { name: "إدارة الفروع", href: "/dashboard/branches", plan: "pro" },
        ],
      },
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

export default function SideNav({
  settings,
  userPermissions,
  userRole,
}: {
  settings: any;
  userPermissions?: UserPermissions | null;
  userRole?: string;
}) {
  const pathname = usePathname() ?? "";
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-open accordion if active route is a child
  useEffect(() => {
    const activeParents: string[] = [];
    sections.forEach((sec: any) => {
      sec.links.forEach((l: any) => {
        if (
          l.subLinks &&
          l.subLinks.some((sub: any) => pathname.startsWith(sub.href))
        ) {
          activeParents.push(l.name);
        }
      });
    });
    if (activeParents.length > 0) {
      setOpenAccordions((prev) =>
        Array.from(new Set([...prev, ...activeParents])),
      );
    }
  }, [pathname]);

  const toggleAccordion = (name: string) => {
    setOpenAccordions((prev) =>
      prev.includes(name)
        ? prev.filter((n: any) => n !== name)
        : [...prev, name],
    );
  };

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const filteredSections = sections
    .map((section: any) => {
      const visibleLinks = section.links
        .map((link: any) => {
          if (link.subLinks) {
            const visibleSubLinks = link.subLinks.filter((sub: any) => {
              if (!userPermissions) return true;
              if (userRole === "ADMIN" || userRole === "SUPER_ADMIN")
                return true;
              // If sublink relies on permission but the permission isn't there, allow standard permission system to handle.
              // For the scope of this update, we will simply rely on getLinkPermission
              const requiredPerm = getLinkPermission(sub.href);
              if (!requiredPerm) return true;
              return userPermissions[requiredPerm as keyof UserPermissions];
            });
            return { ...link, subLinks: visibleSubLinks };
          }
          return link;
        })
        .filter((link: any) => {
          if (link.subLinks) {
            return link.subLinks.length > 0;
          }
          if (!userPermissions) return true;
          if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") return true;
          const requiredPerm = getLinkPermission(link.href);
          if (!requiredPerm) return true;
          return userPermissions[requiredPerm as keyof UserPermissions];
        });
      return { ...section, links: visibleLinks };
    })
    .filter((s: any) => s.links.length > 0);

  // SUPER_ADMIN sees the Control Tower nav; all other roles see the pharmacy nav.
  const activeSections =
    userRole === "SUPER_ADMIN" ? controlTowerSections : filteredSections;

  if (!mounted) {
    return (
      <>
        <div className="md:hidden fixed top-3 right-3 z-50">
          <div className="w-10 h-10 rounded-xl bg-card shadow-md border animate-pulse" />
        </div>
        <div className="hidden md:flex h-full flex-col px-3 py-4 bg-background border-l border-border/80">
          <div className="mb-4 h-32 rounded-2xl bg-gradient-to-tr from-primary to-primary/80 animate-pulse" />
          <div className="flex grow flex-col space-y-2">
            {Array.from({ length: 8 }).map((_: any, i: any) => (
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
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="h-9 w-9 object-contain bg-primary-foreground/90 rounded-lg p-1 mb-1.5"
            />
          ) : (
            <Store className="h-7 w-7 text-primary-foreground/90 mb-1" />
          )}
          <span className="text-lg font-bold truncate leading-tight">
            {settings?.name || "فاراماس"}
          </span>
          <span className="text-[10px] text-primary-foreground/60 font-medium">
            النظام السحابي
          </span>
        </div>
      </Link>

      {/* Navigation */}
      <nav
        className="flex grow flex-col overflow-y-auto space-y-1 px-0.5 pb-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {activeSections.map((section: any, sIdx: any) => (
          <div key={sIdx} className="mb-2">
            {section.label && (
              <div className="px-3 pt-4 pb-1.5 first:pt-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {section.label}
                </span>
              </div>
            )}
            <div className="space-y-1 mt-1">
              {section.links.map((link: any) => {
                const LinkIcon = link.icon;
                // Exact match for flat links, startsWith or exact for subLinks
                const isExactActive =
                  pathname === link.href ||
                  (link.href !== "#" && pathname.startsWith(link.href + "/"));
                const isChildActive =
                  link.subLinks?.some(
                    (sub: any) =>
                      pathname.startsWith(sub.href) ||
                      sub.activeFor?.some((p: string) =>
                        pathname.startsWith(p),
                      ),
                  ) || false;
                const isActive = isExactActive || isChildActive;
                const isExpanded = openAccordions.includes(link.name);

                if (link.subLinks) {
                  return (
                    <div key={link.name} className="flex flex-col space-y-1">
                      <button
                        onClick={() => toggleAccordion(link.name)}
                        className={cn(
                          "flex w-full h-9 items-center justify-between rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
                          {
                            "bg-primary/10 text-primary shadow-sm":
                              isActive && !isExpanded,
                            "text-foreground bg-muted/50":
                              isExpanded && !isActive,
                            "bg-primary/10 text-primary":
                              isExpanded && isActive,
                            "text-muted-foreground hover:bg-muted hover:text-foreground":
                              !isActive && !isExpanded,
                          },
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <LinkIcon className="w-[18px] h-[18px] shrink-0" />
                          <span className="truncate">{link.name}</span>
                        </div>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 transition-transform duration-200",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </button>

                      <div
                        className={cn(
                          "grid transition-all duration-200 ease-in-out",
                          isExpanded
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="flex flex-col gap-1 pr-9 pl-3 pt-1">
                            {link.subLinks.map((subLink: any) => {
                              const isExcluded = subLink.excludeFor?.some(
                                (p: string) => pathname.startsWith(p),
                              );
                              const isSubActive =
                                !isExcluded &&
                                (pathname === subLink.href ||
                                  pathname.startsWith(subLink.href + "/") ||
                                  subLink.activeFor?.some((p: string) =>
                                    pathname.startsWith(p),
                                  ));
                              return (
                                <Link
                                  key={subLink.name}
                                  href={subLink.href}
                                  onClick={() => setMobileOpen(false)}
                                  className={cn(
                                    "flex h-8 items-center rounded-md px-3 text-[12px] font-semibold transition-all duration-150 relative gap-1",
                                    {
                                      "text-primary bg-primary/5": isSubActive,
                                      "text-muted-foreground hover:text-foreground hover:bg-muted/50":
                                        !isSubActive,
                                    },
                                  )}
                                >
                                  {isSubActive && (
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-l-full" />
                                  )}
                                  <span className="truncate flex-1">
                                    {subLink.name}
                                  </span>
                                  {subLink.plan === "pro" && (
                                    <span className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">
                                      <Lock className="w-2.5 h-2.5" /> Pro
                                    </span>
                                  )}
                                  {subLink.plan === "enterprise" && (
                                    <span className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-warning/10 text-warning font-bold shrink-0">
                                      <Lock className="w-2.5 h-2.5" /> Ent
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
                      {
                        "bg-primary/10 text-primary shadow-sm": isActive,
                        "text-muted-foreground hover:bg-muted hover:text-foreground":
                          !isActive,
                      },
                    )}
                  >
                    <LinkIcon className="w-[18px] h-[18px] shrink-0" />
                    <span className="truncate">{link.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex-1" />
      </nav>

      {/* ─── Admin Footer: Settings + Billing (pharmacy ADMINs only) ─── */}
      {userRole === "ADMIN" && (
        <div className="px-0.5 mt-1 flex gap-1">
          <Link
            href="/dashboard/settings"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex flex-1 h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
              (pathname.startsWith("/dashboard/settings") &&
                !pathname.startsWith("/dashboard/settings/billing")) ||
                pathname.startsWith("/dashboard/finance") ||
                pathname.startsWith("/dashboard/expenses") ||
                pathname.startsWith("/dashboard/organizations") ||
                pathname.startsWith("/dashboard/notifications")
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <SettingsIcon className="w-[18px] h-[18px] shrink-0" />
            <span>الإعدادات</span>
          </Link>
          <Link
            href="/dashboard/settings/billing"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
              pathname.startsWith("/dashboard/settings/billing")
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <CreditCard className="w-[18px] h-[18px] shrink-0" />
            <span>اشتراكي</span>
          </Link>
        </div>
      )}

      {/* Sign Out */}
      <form
        action={handleSignOut}
        onSubmit={() => setSigningOut(true)}
        className="mt-2 px-0.5"
      >
        <button
          disabled={signingOut}
          className="group flex h-9 w-full items-center gap-2.5 rounded-lg bg-destructive/10 px-3 text-[13px] font-bold text-destructive hover:bg-destructive hover:text-white transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {signingOut ? (
            <Loader2 className="w-[18px] h-[18px] shrink-0 animate-spin" />
          ) : (
            <LogOut className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:-translate-x-1" />
          )}
          <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
            {signingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </span>
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
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
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
          mobileOpen ? "translate-x-0" : "translate-x-full",
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
