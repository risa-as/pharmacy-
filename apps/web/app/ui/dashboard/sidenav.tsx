"use client";
import { HandCoins } from "@/app/ui/debts/debt-icon";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@faramace/ui";
import { useState, useEffect, useId } from "react";
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
  Landmark,
  MessageSquare,
  ShoppingBag,
  ChevronDown,
  Lock,
  Loader2,
  Download,
  HardDrive,
  Warehouse,
} from "lucide-react";

import { clearSession } from "@/app/lib/actions/auth-actions";
import { ThemeToggle } from "@/app/ui/theme-toggle";
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
    icon?: any;
    activeFor?: string[];
    excludeFor?: string[];
    plan?: "pro" | "enterprise";
    /** يُخفى عن أي دور غير ADMIN / SUPER_ADMIN */
    adminOnly?: boolean;
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
    label: "العملاء",
    links: [
      { name: "المؤسسات", href: "/dashboard/admin/tenants", icon: Building2 },
      { name: "الباقات", href: "/dashboard/admin/plans", icon: CreditCard },
      { name: "المذاخر", href: "/dashboard/admin/warehouses", icon: Warehouse },
    ],
  },
  {
    label: "التراخيص",
    links: [
      { name: "التراخيص", href: "/dashboard/admin/licenses", icon: Crown },
      { name: "تراخيص الأوف لاين", href: "/dashboard/admin/offline-licenses", icon: HardDrive },
    ],
  },
  {
    label: "المنصة",
    links: [
      { name: "معلومات الدفع", href: "/dashboard/admin/payment-info", icon: Landmark },
      { name: "إعدادات التنزيل", href: "/dashboard/admin/downloads", icon: Download },
      { name: "تسوية الملكية", href: "/dashboard/admin/ownership", icon: Landmark },
      { name: "قاعدة الأدوية العالمية", href: "/dashboard/admin/drugs", icon: Pill },
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
    links: [{ name: "نقطة البيع", href: "/dashboard/pos-temp", icon: ShoppingCart }],
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
          { name: "دفتر الديون", href: "/dashboard/debts", icon: HandCoins },
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
            // مسارات تحت /dashboard/purchases لها روابطها المستقلة في الشريط:
            // «الطلبات الذكية» أدناه و«طلبات المذاخر» في قسم المذاخر.
            excludeFor: [
              "/dashboard/purchases/smart-order",
              "/dashboard/purchases/warehouse-orders",
            ],
          },
          { name: "الطلبات الذكية", href: "/dashboard/purchases/smart-order" },
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
            adminOnly: true,
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
            activeFor: ["/dashboard/users/permissions-guide"],
            plan: "pro",
          },
          { name: "إدارة الفروع", href: "/dashboard/branches", plan: "pro" },
        ],
      },
    ],
  },

  // ─── B2B: المذاخر (حية منذ ميزة المذاخر 2026-09-03) ──────────────────────
  {
      label: "المذاخر",
      links: [
          { name: "طلبات المذاخر", href: "/dashboard/purchases/warehouse-orders", icon: Building2 },
      ],
  },

  // ─── FUTURE: Bucket 3 — Advanced & B2B (المتبقي) ─────────────────────────
  // [المذاخر 2026-09-03] قسم المذاخر أصبح حياً أعلاه — بقية الأقسام شروطها
  // لم تتحقق بعد (محدّث من «المستودعات العراقية» الأصلية لأن المذاخر الآن
  // طرف حي داخل المنصة بدل تكامل خارجي). الأقسام الأخرى كما هي:
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

/**
 * Single source of truth for "is this subLink active" — reused for the
 * group's own active-highlight (render) and for deciding which accordion
 * groups start/auto-expand (initial state + effect), so there is exactly
 * one route-matching rule instead of three drifting copies.
 */
function isSubLinkActive(
  subLink: { href: string; activeFor?: string[]; excludeFor?: string[] },
  pathname: string,
): boolean {
  // excludeFor أولاً: كانت تُحترم عند رسم الرابط الفرعي فقط، فكان رأس المجموعة
  // يُضاء (ويُفتح تلقائياً) لمسار مستثنى — مثلاً «العملاء والتوريد» على صفحة
  // طلبات المذاخر لأن /dashboard/purchases بادئةٌ لها.
  if (subLink.excludeFor?.some((p) => pathname.startsWith(p))) return false;
  // حدّ المسار: `href + "/"` لا startsWith المجرّد، وإلا طابق /dashboard/purchases
  // مساراً مثل /dashboard/purchases-archive.
  return (
    pathname === subLink.href ||
    pathname.startsWith(subLink.href + "/") ||
    (subLink.activeFor?.some((p) => pathname.startsWith(p)) ?? false)
  );
}

// تسمية عربية لأدوار الصيدلية (ADMIN/SUPER_ADMIN/PHARMACIST/CASHIER) — بحث في
// app/lib/permissions.ts و route-permissions.ts لم يجد خريطة مُصدَّرة لهذه
// الأدوار (فقط PERMISSION_LABELS لأسماء الصلاحيات، لا لأسماء الأدوار).
// ROLE_META في app/dashboard/users/page.tsx يحمل نفس المسميات لكنه محلي غير
// مُصدَّر داخل صفحة خادم؛ استيراده من هنا (مكوّن عميل) غير مناسب. أُضيفت
// خريطة محلية صغيرة هنا بنفس التسميات هناك للاتساق البصري عبر التطبيق.
const ROLE_LABELS_AR: Record<string, string> = {
  SUPER_ADMIN: "مدير المنصة",
  ADMIN: "مدير",
  PHARMACIST: "صيدلي",
  CASHIER: "كاشير",
};

/** Names of the (pharmacy-nav) parent links whose subLinks contain the active route. */
function getActiveSubLinkParents(pathname: string): string[] {
  const parents: string[] = [];
  sections.forEach((sec) => {
    sec.links.forEach((l) => {
      if (
        l.subLinks?.some((sub: any) => isSubLinkActive(sub, pathname))
      ) {
        parents.push(l.name);
      }
    });
  });
  return parents;
}

export default function SideNav({
  settings,
  userPermissions,
  userRole,
  userEmail,
  userName,
}: {
  settings: any;
  userPermissions?: UserPermissions | null;
  userRole?: string;
  userEmail?: string;
  userName?: string | null;
}) {
  const pathname = usePathname() ?? "";
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Initial value: the group(s) already containing the active route start
  // expanded (mirrors WarehouseSideNav's lazy useState initializer) — avoids
  // a collapsed-then-expanded flash on first paint.
  const [openAccordions, setOpenAccordions] = useState<string[]>(() =>
    getActiveSubLinkParents(pathname),
  );
  const [signingOut, setSigningOut] = useState(false);
  // uid disambiguates accordion panel ids: this component is mounted twice
  // by app/dashboard/layout.tsx (one wrapper per breakpoint), and internally
  // renders its nav content twice more (desktop rail + mobile drawer) — see
  // renderNavContent below. idPrefix alone (desktop/mobile) isn't enough to
  // guarantee document-wide uniqueness across the two outer mounts, so each
  // mounted instance gets its own SSR-safe uid via useId().
  const uid = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-open accordion if active route is a child. This must only ever ADD
  // to the open set — never remove — so it doesn't collapse a group the user
  // deliberately opened on every navigation.
  useEffect(() => {
    const activeParents = getActiveSubLinkParents(pathname);
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
              // روابط خاصة بالمدير فقط — تُخفى عن باقي الأدوار
              if (
                sub.adminOnly &&
                userRole !== "ADMIN" &&
                userRole !== "SUPER_ADMIN"
              )
                return false;
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

  // Identity block (below the logo header) — mirrors WarehouseSideNav's
  // avatar/name/role/email card. Name takes priority (both as the bold
  // title and the avatar initial); email is the fallback for both, and is
  // only rendered a second time beneath the title when it differs from it
  // (avoids showing the same email twice when no name is on file).
  const trimmedName = userName?.trim() || "";
  const identityTitle = trimmedName || userEmail || "المستخدم";
  const avatarSource = trimmedName || userEmail || "";
  const avatarInitial = avatarSource ? avatarSource.charAt(0).toUpperCase() : "؟";
  const roleLabel = userRole ? (ROLE_LABELS_AR[userRole] ?? null) : null;

  if (!mounted) {
    return (
      <>
        <div className="md:hidden fixed top-3 right-3 z-50">
          <div className="w-10 h-10 rounded-xl bg-card shadow-md border animate-pulse" />
        </div>
        <div className="hidden md:flex h-full flex-col px-3 py-4 bg-card border-l border-border/80">
          <div className="mb-4 h-32 rounded-lg bg-primary/10 animate-pulse" />
          <div className="flex grow flex-col space-y-2">
            {Array.from({ length: 8 }).map((_: any, i: any) => (
              <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </>
    );
  }

  const renderNavContent = (idPrefix: string) => (
    <>
      {/* Brand Header — minimal row matching WarehouseSideNav: small square
          mark + name + muted subtitle, then a divider. The card, top strip and
          hover-scale are gone on purpose; this is a toolbar, not a banner.
          settings.logoUrl is kept (the warehouse has no logo concept). */}
      <Link
        className="flex items-center gap-2.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/"
        onClick={() => setMobileOpen(false)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="h-9 w-9 object-contain" />
          ) : (
            <Store className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {settings?.name || "فاراماس"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            فاراماس نظام سحابي لإدارة الصيدليات
          </p>
        </div>
      </Link>
      <div className="my-3 border-t" />

      {/* Identity block — who is signed in (parity with WarehouseSideNav's
          avatar/name/role/email card, which the pharmacy side never had). */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/60 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {avatarInitial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground">{identityTitle}</p>
            {roleLabel && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {roleLabel}
              </span>
            )}
          </div>
          {userEmail && userEmail !== identityTitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
              {userEmail}
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav
        className="flex grow flex-col overflow-y-auto space-y-1 px-0.5 pb-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {activeSections.map((section: any, sIdx: any) => (
          <div key={sIdx} className="mb-2">
            {section.label && (
              <div className="px-3 pt-4 pb-1.5 first:pt-0">
                <span className="text-xs font-semibold text-muted-foreground">
                  {section.label}
                </span>
              </div>
            )}
            <div className="space-y-1 mt-1">
              {section.links.map((link: any, lIdx: number) => {
                const LinkIcon = link.icon;
                // Exact match for flat links, startsWith or exact for subLinks.
                // جذر اللوحة (/dashboard) تطابقٌ تامٌّ فقط: كل صفحات اللوحة تبدأ بـ
                // "/dashboard/"، فالمطابقة بالبادئة كانت تُضيء «الرئيسية» (و«نظرة
                // عامة» للسوبر أدمن) على كل صفحة بجانب الرابط الفعلي.
                const isExactActive =
                  pathname === link.href ||
                  (link.href !== "#" &&
                    link.href !== "/dashboard" &&
                    pathname.startsWith(link.href + "/"));
                const isChildActive =
                  link.subLinks?.some((sub: any) =>
                    isSubLinkActive(sub, pathname),
                  ) || false;
                const isActive = isExactActive || isChildActive;
                const isExpanded = openAccordions.includes(link.name);

                if (link.subLinks) {
                  const panelId = `${uid}-nav-panel-${idPrefix}-${sIdx}-${lIdx}`;
                  return (
                    <div key={link.name} className="flex flex-col space-y-1">
                      <button
                        type="button"
                        onClick={() => toggleAccordion(link.name)}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        className={cn(
                          "flex w-full h-9 items-center justify-between rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
                          {
                            // التظليل الممتلئ يعني شيئاً واحداً: «هذه هي الصفحة
                            // الحالية». رأس المجموعة ليس صفحة (href = "#")، فكان
                            // إضاءته بنفس لون الرابط الفرعي النشط تُظهر كتلتين
                            // ممتلئتين فوق بعضهما. الآن يكتفي الرأس بإشارة أخفض
                            // (نصّ كامل التباين + أيقونة ملوّنة) — و isChildActive
                            // يبقى مستخدماً لفتح الأكورديون تلقائياً فقط.
                            "bg-primary text-primary-foreground": isExactActive,
                            "text-foreground bg-muted/50":
                              !isExactActive && (isChildActive || isExpanded),
                            "text-muted-foreground hover:bg-muted hover:text-foreground":
                              !isActive && !isExpanded,
                          },
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <LinkIcon
                            className={cn(
                              "w-[18px] h-[18px] shrink-0",
                              isChildActive && !isExactActive && "text-primary",
                            )}
                          />
                          <span className="truncate">{link.name}</span>
                        </div>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 transition-transform duration-200 motion-reduce:transition-none",
                            isExpanded && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      </button>

                      <div
                        id={panelId}
                        hidden={!isExpanded}
                        className="space-y-1 pr-9 pl-3 pt-1"
                      >
                        {link.subLinks.map((subLink: any) => {
                          const isSubActive = isSubLinkActive(subLink, pathname);
                          return (
                            <Link
                              key={subLink.name}
                              href={subLink.href}
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                "flex h-8 items-center rounded-md px-3 text-[12px] font-semibold transition-all duration-150 relative gap-1",
                                {
                                  "bg-primary text-primary-foreground": isSubActive,
                                  "text-muted-foreground hover:text-foreground hover:bg-muted/50":
                                    !isSubActive,
                                },
                              )}
                            >
                              {subLink.icon && <subLink.icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
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
                        "bg-primary text-primary-foreground": isActive,
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

      {/* ─── Footer: Settings + Billing (pharmacy ADMINs only) + Sign Out —
          anchored behind a divider, matching WarehouseSideNav's footer. ─── */}
      <div className="mt-4 space-y-1 border-t px-0.5 pt-4">
        {userRole === "ADMIN" && (
          <div className="space-y-1">
          <Link
            href="/dashboard/settings"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
              (pathname.startsWith("/dashboard/settings") &&
                !pathname.startsWith("/dashboard/settings/billing")) ||
                pathname.startsWith("/dashboard/finance") ||
                pathname.startsWith("/dashboard/expenses") ||
                pathname.startsWith("/dashboard/organizations") ||
                pathname.startsWith("/dashboard/notifications")
                ? "bg-primary text-primary-foreground"
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
              "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-bold transition-all duration-150",
              pathname.startsWith("/dashboard/settings/billing")
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <CreditCard className="w-[18px] h-[18px] shrink-0" />
            <span>اشتراكي</span>
          </Link>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <ThemeToggle />
          <button
            disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await clearSession();
            window.location.href = '/login';
          }}
          className="group flex h-9 flex-1 items-center gap-2.5 rounded-lg px-3 text-[13px] font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
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
        </div>
      </div>

      {/* Powered by */}
      {/* <p className="mt-3 text-center text-[10px] text-muted-foreground/50 select-none">
        طور بواسطة{" "}
        <span className="font-semibold text-muted-foreground/70">Risa02</span>
      </p> */}
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
          "md:hidden fixed top-0 right-0 z-40 h-full w-72 bg-card shadow-2xl border-l border-border flex flex-col px-3 py-4 transition-transform duration-300 ease-in-out overflow-y-auto",
          mobileOpen ? "translate-x-0" : "translate-x-full",
        )}
        dir="rtl"
      >
        <div className="h-4" />
        {renderNavContent("mobile")}
      </div>

      {/* ═══ Desktop Sidebar ═══ */}
      <div className="hidden md:flex h-full flex-col px-3 py-4 md:px-2 bg-card border-l border-border/80">
        {renderNavContent("desktop")}
      </div>
    </>
  );
}
