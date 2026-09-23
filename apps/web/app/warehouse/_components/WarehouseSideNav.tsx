"use client";

// إعادة بناء شريط تنقّل بوابة المذاخر على نمط app/ui/dashboard/sidenav.tsx
// (معيار الجودة المطلوب): شريط جانبي مُجمَّع بأقسام هادئة، حالة تفعيل حقيقية
// عبر usePathname، درج قابل للطي تحت md، وزر تسجيل خروج بنفس آلية جانب
// الصيدلية (clearSession). هذا مكوّن عرض بحت — قائمة groups/tabs تصل جاهزة
// ومُفلترة من layout.tsx (خادم)؛ لا فحص صلاحية هنا إطلاقاً.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
    ChevronDown,
    LogOut,
    Loader2,
    Menu,
    X,
    Warehouse,
    LayoutDashboard,
    ClipboardList,
    RotateCcw,
    Pill,
    Boxes,
    Building2,
    Wallet,
    BarChart3,
    UsersRound,
    Settings,
    Circle,
    Truck,
    ShoppingBag,
    Tag,
    type LucideIcon,
} from "lucide-react";
import { clearSession } from "@/app/lib/actions/auth-actions";
import { ThemeToggle } from "@/app/ui/theme-toggle";

/**
 * خريطة أيقونات التنقّل — عرض بحت، مبنيّة هنا (وليس في
 * app/lib/warehouse-permissions.ts) لأن تلك وحدة منطق خالصة يستهلكها كود
 * خادم واختبارات؛ إقحام مكوّنات React فيها يلوّثها. Circle هو الاحتياطي
 * الآمن: أي href مستقبلي لا يُضاف هنا عمداً لن يُسقط الشريط، بل يعرض أيقونة
 * محايدة بدل الانهيار.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
    "/warehouse": LayoutDashboard,
    "/warehouse/orders": ClipboardList,
    "/warehouse/reps": Truck,
    "/warehouse/purchases": ShoppingBag,
    "/warehouse/returns": RotateCcw,
    "/warehouse/catalog": Pill,
    "/warehouse/stock": Boxes,
    "/warehouse/labels": Tag,
    "/warehouse/customers": Building2,
    "/warehouse/accounts": Wallet,
    "/warehouse/reports": BarChart3,
    "/warehouse/users": UsersRound,
    "/warehouse/settings": Settings,
};
const FALLBACK_NAV_ICON: LucideIcon = Circle;

interface NavTab {
    href: string;
    label: string;
}
interface NavGroup {
    label: string;
    tabs: NavTab[];
}

/** الرئيسية (/warehouse) مطابقة تامة فقط — بادئة كل مسار آخر، فلا تُميَّز نشطة على كل صفحة. */
function isTabActive(pathname: string, href: string): boolean {
    if (href === "/warehouse/accounts" && pathname === "/warehouse/settlements") return true;
    if (href === "/warehouse") return pathname === "/warehouse";
    return pathname === href || pathname.startsWith(href + "/");
}

/** أسماء المجموعات التي تحوي التبويب النشط حالياً (عادة مجموعة واحدة). */
function getActiveGroupLabels(groups: NavGroup[], pathname: string): string[] {
    return groups.filter((g) => g.tabs.some((t) => isTabActive(pathname, t.href))).map((g) => g.label);
}

export default function WarehouseSideNav({
    groups,
    warehouseName,
    userEmail,
    roleLabel,
}: {
    groups: NavGroup[];
    warehouseName: string;
    userEmail: string;
    roleLabel: string | null;
}) {
    const pathname = usePathname() ?? "";
    const [mobileOpen, setMobileOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    // مجموعات مفتوحة حالياً (accordion غير حصري — عدة مجموعات قد تكون مفتوحة معاً).
    // القيمة الأولية: المجموعة الحاوية للمسار النشط فقط؛ الباقي مطوي افتراضياً.
    const [openGroups, setOpenGroups] = useState<string[]>(() => getActiveGroupLabels(groups, pathname));

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    // عند التنقّل، أضِف مجموعة المسار النشط إلى المفتوحة دون إغلاق أي مجموعة
    // طواها المستخدم يدوياً — الدمج عبر Set/prev يضمن أنّ هذا التأثير "يضيف" فقط.
    useEffect(() => {
        const activeLabels = getActiveGroupLabels(groups, pathname);
        if (activeLabels.length === 0) return;
        setOpenGroups((prev) => {
            if (activeLabels.every((l) => prev.includes(l))) return prev;
            return Array.from(new Set([...prev, ...activeLabels]));
        });
    }, [pathname, groups]);

    const toggleGroup = (label: string) => {
        setOpenGroups((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
    };

    useEffect(() => {
        document.body.style.overflow = mobileOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileOpen]);

    const signOut = async () => {
        setSigningOut(true);
        await clearSession();
        window.location.href = "/login";
    };

    // idPrefix يمنع تكرار الـ id بين نسخة الدرج (جوال) ونسخة الشريط الثابت
    // (حاسوب) — renderNavContent يُستدعى مرتين أدناه بنفس الأقسام.
    const renderNavContent = (idPrefix: string) => (
        <>
            {/* رأس العلامة — أنكر بصري ثابت أعلى الشريط، موجز عمداً (شريط أدوات لا واجهة تسويقية) */}
            <div className="flex items-center gap-2.5 px-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Warehouse className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">بوابة المذاخر</p>
                    <p className="truncate text-xs text-muted-foreground">فاراماس</p>
                </div>
            </div>
            <div className="my-3 border-t" />

            <div className="flex items-center gap-3 rounded-lg border bg-muted/60 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {warehouseName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-foreground">{warehouseName}</p>
                        {roleLabel && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {roleLabel}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                        {userEmail}
                    </p>
                </div>
            </div>

            <nav className="mt-4 flex grow flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {groups.map((g, i) => {
                    const isOpen = openGroups.includes(g.label);
                    const panelId = `warehouse-nav-panel-${idPrefix}-${i}`;
                    return (
                        <div key={g.label}>
                            <button
                                type="button"
                                onClick={() => toggleGroup(g.label)}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span>{g.label}</span>
                                <ChevronDown
                                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                                        isOpen ? "rotate-180" : ""
                                    }`}
                                    aria-hidden="true"
                                />
                            </button>
                            <div id={panelId} hidden={!isOpen} className="space-y-0.5 pt-0.5">
                                {g.tabs.map((t) => {
                                    const active = isTabActive(pathname, t.href);
                                    const Icon = NAV_ICONS[t.href] ?? FALLBACK_NAV_ICON;
                                    return (
                                        <Link
                                            key={t.href}
                                            href={t.href}
                                            onClick={() => setMobileOpen(false)}
                                            aria-current={active ? "page" : undefined}
                                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                active
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                            }`}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                            <span className="truncate">{t.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            <div className="mt-4 flex items-center gap-2 border-t pt-4">
                <ThemeToggle />
                <button
                    type="button"
                    disabled={signingOut}
                    onClick={signOut}
                    className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    {signingOut ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}
                </button>
            </div>
        </>
    );

    return (
        <>
            {/* شريط علوي للجوال — يحمل زر فتح الدرج فقط تحت md.
                warehouse-mobile-topbar: علامة صريحة يستهدفها @media print في
                app/globals.css (المرحلة 4) — <div> عادي لا <nav>, فلا تكفي
                قواعد الإخفاء العامة هناك بالوسم وحده. */}
            <div className="warehouse-mobile-topbar flex items-center justify-between border-b bg-card px-4 py-3 shadow-sm md:hidden">
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{warehouseName}</p>
                    <p className="truncate text-xs text-muted-foreground">بوابة المذاخر — فاراماس</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                <ThemeToggle />
                <button
                    type="button"
                    onClick={() => setMobileOpen((v) => !v)}
                    aria-expanded={mobileOpen}
                    aria-controls="warehouse-mobile-nav"
                    aria-label={mobileOpen ? "إغلاق قائمة التنقّل" : "فتح قائمة التنقّل"}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                </div>
            </div>

            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 md:hidden"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <div
                id="warehouse-mobile-nav"
                className={`fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l bg-card p-4 shadow-lg transition-transform duration-200 ease-in-out md:hidden ${
                    mobileOpen ? "translate-x-0" : "translate-x-full"
                }`}
                dir="rtl"
            >
                {renderNavContent("mobile")}
            </div>

            {/* شريط جانبي ثابت للحاسوب */}
            <aside className="hidden h-full w-64 shrink-0 flex-col border-l bg-card p-4 md:flex">
                {renderNavContent("desktop")}
            </aside>
        </>
    );
}
