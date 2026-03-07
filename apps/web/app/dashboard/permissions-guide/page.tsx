"use client";

import { useState, useEffect } from "react";
import {
    Shield, ShoppingCart, Undo2, Package, CreditCard, BarChart3,
    UserCircle, Truck, Settings, BookOpen, Lock, Unlock, Eye,
    ChevronDown, ChevronUp, CheckCircle2, XCircle, Info,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   Permission Definitions — mirrors permissions.ts exactly
   ═══════════════════════════════════════════════════════════ */

interface PermDef {
    key: string;
    label: string;
    description: string;
    pages: { path: string; name: string }[];
    actionOnly?: boolean; // true = controls a button, not a whole page
}

interface Category {
    id: string;
    name: string;
    icon: any;
    color: string;
    bgColor: string;
    borderColor: string;
    permissions: PermDef[];
}

const categories: Category[] = [
    {
        id: "sales",
        name: "المبيعات",
        icon: ShoppingCart,
        color: "text-primary",
        bgColor: "bg-primary/10",
        borderColor: "border-primary",
        permissions: [
            {
                key: "canViewSales",
                label: "عرض المبيعات",
                description: "الوصول لصفحات المبيعات والفواتير",
                pages: [
                    { path: "/dashboard/sales", name: "المبيعات" },
                    { path: "/dashboard/invoices", name: "الفواتير" },
                ],
            },
            {
                key: "canSell",
                label: "البيع",
                description: "إتمام عمليات البيع في نقطة البيع",
                pages: [],
                actionOnly: true,
            },
            {
                key: "canApplyDiscount",
                label: "تطبيق خصم",
                description: "تطبيق خصومات أثناء البيع",
                pages: [],
                actionOnly: true,
            },
            {
                key: "canDeleteSale",
                label: "حذف فاتورة",
                description: "حذف فاتورة بيع من السجل",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "returns",
        name: "المرتجعات",
        icon: Undo2,
        color: "text-info",
        bgColor: "bg-info/10",
        borderColor: "border-info/20",
        permissions: [
            {
                key: "canViewReturns",
                label: "عرض المرتجعات",
                description: "الوصول لصفحة المرتجعات",
                pages: [{ path: "/dashboard/returns", name: "المرتجعات" }],
            },
            {
                key: "canProcessReturn",
                label: "معالجة مرتجع",
                description: "إنشاء عملية إرجاع جديدة",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "inventory",
        name: "المخزون",
        icon: Package,
        color: "text-success",
        bgColor: "bg-success/10",
        borderColor: "border-emerald-200",
        permissions: [
            {
                key: "canViewInventory",
                label: "عرض المخزون",
                description: "الوصول لصفحات المخزون والأدوية",
                pages: [
                    { path: "/dashboard/inventory", name: "المخزون" },
                    { path: "/dashboard/drugs", name: "قاعدة الأدوية" },
                    { path: "/dashboard/drugs/import", name: "استيراد أدوية" },
                    { path: "/dashboard/inventory/barcode-print", name: "طباعة الباركود" },
                    { path: "/dashboard/inventory/shortages", name: "النواقص" },
                    { path: "/dashboard/inventory/product-movement", name: "حركة منتج" },
                    { path: "/dashboard/inventory/expired-damaged", name: "التوالف والمنتهية" },
                    { path: "/dashboard/marketplace", name: "سوق B2B" },
                ],
            },
            {
                key: "canEditPrice",
                label: "تعديل السعر",
                description: "تعديل أسعار الأدوية وتحذيرات الهامش",
                pages: [{ path: "/dashboard/inventory/margin-warnings", name: "تحذيرات الهامش" }],
            },
            {
                key: "canBulkEditPrice",
                label: "تعديل أسعار بالجملة",
                description: "تعديل أسعار مجموعة أدوية دفعة واحدة",
                pages: [{ path: "/dashboard/inventory/bulk-pricing", name: "تعديل أسعار بالجملة" }],
            },
            {
                key: "canTransferStock",
                label: "تحويل بين الأفرع",
                description: "إنشاء تحويلات مخزون بين الأفرع",
                pages: [{ path: "/dashboard/inventory/transfers", name: "التحويلات" }],
            },
            {
                key: "canDoStocktake",
                label: "جرد المخزون",
                description: "إنشاء وإدارة عمليات الجرد",
                pages: [{ path: "/dashboard/inventory/stocktakes", name: "الجرد" }],
            },
            {
                key: "canAddDrug",
                label: "إضافة دواء",
                description: "إضافة أدوية جديدة للقاعدة",
                pages: [],
                actionOnly: true,
            },
            {
                key: "canEditDrug",
                label: "تعديل دواء",
                description: "تعديل بيانات الأدوية",
                pages: [],
                actionOnly: true,
            },
            {
                key: "canDeleteDrug",
                label: "حذف دواء",
                description: "حذف دواء من القاعدة",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "finance",
        name: "المالية",
        icon: CreditCard,
        color: "text-warning",
        bgColor: "bg-warning/10",
        borderColor: "border-warning/30",
        permissions: [
            {
                key: "canViewExpenses",
                label: "عرض المالية",
                description: "الوصول لصفحات المصروفات والصناديق",
                pages: [
                    { path: "/dashboard/expenses", name: "المصروفات" },
                    { path: "/dashboard/finance/safes", name: "الصناديق" },
                    { path: "/dashboard/finance/transactions", name: "دفتر القيود" },
                    { path: "/dashboard/payments", name: "المدفوعات" },
                ],
            },
            {
                key: "canCreateExpense",
                label: "إنشاء مصروف",
                description: "تسجيل مصروف جديد",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "reports",
        name: "التقارير",
        icon: BarChart3,
        color: "text-cyan-700",
        bgColor: "bg-cyan-50",
        borderColor: "border-cyan-200",
        permissions: [
            {
                key: "canViewReports",
                label: "عرض التقارير",
                description: "الوصول لصفحة التقارير الرئيسية",
                pages: [
                    { path: "/dashboard/reports", name: "التقارير" },
                    { path: "/dashboard/reports/shifts", name: "سجل الورديات" },
                    { path: "/dashboard/alerts", name: "التنبيهات" },
                ],
            },
            {
                key: "canViewProfitReport",
                label: "تقرير الأرباح",
                description: "الوصول لتقارير الأرباح والتحليلات",
                pages: [
                    { path: "/dashboard/reports/profit", name: "تقرير الأرباح" },
                    { path: "/dashboard/reports/branch-comparison", name: "مقارنة الفروع" },
                    { path: "/dashboard/analytics/demand-forecast", name: "تنبؤ الطلب AI" },
                ],
            },
            {
                key: "canViewEmployeeReport",
                label: "تقارير الموظفين",
                description: "الوصول لتقارير أداء الموظفين",
                pages: [{ path: "/dashboard/reports/employees", name: "تقارير الموظفين" }],
            },
            {
                key: "canExportExcel",
                label: "تصدير Excel",
                description: "تصدير البيانات كملفات Excel",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "patients",
        name: "العملاء",
        icon: UserCircle,
        color: "text-pink-700",
        bgColor: "bg-pink-50",
        borderColor: "border-pink-200",
        permissions: [
            {
                key: "canViewPatients",
                label: "عرض المرضى",
                description: "الوصول لسجل المرضى والوصفات",
                pages: [
                    { path: "/dashboard/patients", name: "سجل المرضى" },
                    { path: "/dashboard/loyalty", name: "برنامج الولاء" },
                    { path: "/dashboard/prescriptions", name: "الوصفات" },
                ],
            },
            {
                key: "canEditPatient",
                label: "تعديل بيانات مريض",
                description: "تعديل معلومات المرضى",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "supply",
        name: "التوريد",
        icon: Truck,
        color: "text-info",
        bgColor: "bg-info/10",
        borderColor: "border-info/20",
        permissions: [
            {
                key: "canViewSuppliers",
                label: "عرض الموردين",
                description: "الوصول لصفحة الموردين",
                pages: [{ path: "/dashboard/suppliers", name: "الموردين" }],
            },
            {
                key: "canCreatePurchase",
                label: "إنشاء طلب شراء",
                description: "إنشاء طلبات شراء من الموردين",
                pages: [
                    { path: "/dashboard/purchases", name: "سجل المشتريات" },
                    { path: "/dashboard/warehouses", name: "المستودعات العراقية" },
                ],
            },
        ],
    },
    {
        id: "admin",
        name: "الإدارة",
        icon: Settings,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        borderColor: "border-red-200",
        permissions: [
            {
                key: "canManageUsers",
                label: "إدارة المستخدمين",
                description: "إنشاء وتعديل وحذف المستخدمين",
                pages: [
                    { path: "/dashboard/users", name: "المستخدمين" },
                    { path: "/dashboard/notifications", name: "التنبيهات Push" },
                ],
            },
            {
                key: "canManageBranches",
                label: "إدارة الفروع",
                description: "إنشاء وتعديل الفروع",
                pages: [{ path: "/dashboard/branches", name: "الفروع" }],
            },
            {
                key: "canViewAuditLog",
                label: "سجل النشاطات",
                description: "عرض سجل جميع العمليات",
                pages: [{ path: "/dashboard/reports/audit-log", name: "سجل النشاطات" }],
            },
            {
                key: "canChangeSettings",
                label: "تغيير الإعدادات",
                description: "تعديل إعدادات النظام",
                pages: [
                    { path: "/dashboard/settings", name: "الإعدادات" },
                    { path: "/dashboard/tenants", name: "إدارة المؤسسات" },
                ],
            },
            {
                key: "canBackup",
                label: "النسخ الاحتياطي",
                description: "إنشاء واستعادة نسخ احتياطية",
                pages: [],
                actionOnly: true,
            },
        ],
    },
    {
        id: "debts",
        name: "الديون",
        icon: BookOpen,
        color: "text-teal-700",
        bgColor: "bg-teal-50",
        borderColor: "border-teal-200",
        permissions: [
            {
                key: "canViewDebts",
                label: "عرض الديون",
                description: "الوصول لدفتر الديون",
                pages: [{ path: "/dashboard/debts", name: "دفتر الديون" }],
            },
            {
                key: "canPayDebt",
                label: "تسجيل سداد",
                description: "تسجيل عملية سداد دين",
                pages: [],
                actionOnly: true,
            },
        ],
    },
];

/* ═══════ Role defaults (mirrors permissions.ts) ═══════ */
const roleDefaults: Record<string, Record<string, boolean>> = {
    ADMIN: Object.fromEntries(categories.flatMap((c: any) => c.permissions.map((p: any) => [p.key, true]))),
    PHARMACIST: {
        canSell: true, canApplyDiscount: true, canViewSales: true, canDeleteSale: false,
        canProcessReturn: true, canViewReturns: true,
        canViewInventory: true, canAddDrug: true, canEditDrug: true, canDeleteDrug: false,
        canEditPrice: false, canBulkEditPrice: false, canTransferStock: false, canDoStocktake: true,
        canViewExpenses: false, canCreateExpense: false,
        canViewReports: true, canViewProfitReport: false, canViewEmployeeReport: false, canExportExcel: false,
        canViewPatients: true, canEditPatient: true,
        canViewSuppliers: true, canCreatePurchase: true,
        canManageUsers: false, canManageBranches: false, canViewAuditLog: false, canChangeSettings: false, canBackup: false,
        canViewDebts: true, canPayDebt: true,
    },
    CASHIER: {
        canSell: true, canApplyDiscount: false, canViewSales: true, canDeleteSale: false,
        canProcessReturn: false, canViewReturns: false,
        canViewInventory: true, canAddDrug: false, canEditDrug: false, canDeleteDrug: false,
        canEditPrice: false, canBulkEditPrice: false, canTransferStock: false, canDoStocktake: false,
        canViewExpenses: false, canCreateExpense: false,
        canViewReports: false, canViewProfitReport: false, canViewEmployeeReport: false, canExportExcel: false,
        canViewPatients: true, canEditPatient: false,
        canViewSuppliers: false, canCreatePurchase: false,
        canManageUsers: false, canManageBranches: false, canViewAuditLog: false, canChangeSettings: false, canBackup: false,
        canViewDebts: true, canPayDebt: true,
    },
};

const roleLabels: Record<string, { name: string; color: string; bg: string }> = {
    ADMIN: { name: "مدير النظام", color: "text-destructive", bg: "bg-destructive/10" },
    PHARMACIST: { name: "صيدلي", color: "text-primary", bg: "bg-primary/10" },
    CASHIER: { name: "كاشير", color: "text-success", bg: "bg-success/10" },
};

/* ═══════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════ */

export default function PermissionsGuidePage() {
    const [mounted, setMounted] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<string>("ALL");

    useEffect(() => { setMounted(true); }, []);

    const toggleCategory = (id: string) => {
        setExpandedCategory(prev => (prev === id ? null : id));
    };

    const totalPerms = categories.reduce((sum: any, c: any) => sum + c.permissions.length, 0);
    const pagePerms = categories.reduce(
        (sum: any, c: any) => sum + c.permissions.filter((p: any) => !p.actionOnly).length, 0
    );

    if (!mounted) return null;

    return (
        <div className="glass-card w-full max-w-5xl mx-auto p-6" dir="rtl">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                        <Shield className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-foreground">دليل الصلاحيات</h1>
                        <p className="text-sm text-muted-foreground">مرجع شامل لنظام الصلاحيات وتقييد الوصول</p>
                    </div>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4 text-center">
                    <div className="text-3xl font-black text-foreground">{totalPerms}</div>
                    <div className="text-xs text-muted-foreground font-bold mt-1">إجمالي الصلاحيات</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 text-center">
                    <div className="text-3xl font-black text-primary">{pagePerms}</div>
                    <div className="text-xs text-muted-foreground font-bold mt-1">تتحكم بصفحات</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 text-center">
                    <div className="text-3xl font-black text-success">{totalPerms - pagePerms}</div>
                    <div className="text-xs text-muted-foreground font-bold mt-1">تتحكم بإجراءات</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 text-center">
                    <div className="text-3xl font-black text-info">{categories.length}</div>
                    <div className="text-xs text-muted-foreground font-bold mt-1">فئات</div>
                </div>
            </div>

            {/* How it works */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-primary p-6 mb-8">
                <h2 className="font-bold text-primary mb-3 flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    كيف يعمل نظام الصلاحيات؟
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-card/80 rounded-xl p-4 border border-primary">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-black flex items-center justify-center mb-2">1</div>
                        <div className="font-bold text-foreground text-sm mb-1">الصلاحيات الافتراضية</div>
                        <div className="text-xs text-muted-foreground">
                            كل دور (مدير، صيدلي، كاشير) لديه صلاحيات افتراضية محددة مسبقاً
                        </div>
                    </div>
                    <div className="bg-card/80 rounded-xl p-4 border border-primary">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-black flex items-center justify-center mb-2">2</div>
                        <div className="font-bold text-foreground text-sm mb-1">التخصيص لكل مستخدم</div>
                        <div className="text-xs text-muted-foreground">
                            يمكن للمدير تعديل صلاحيات أي مستخدم بشكل فردي من صفحة إدارة الصلاحيات
                        </div>
                    </div>
                    <div className="bg-card/80 rounded-xl p-4 border border-primary">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-black flex items-center justify-center mb-2">3</div>
                        <div className="font-bold text-foreground text-sm mb-1">التطبيق التلقائي</div>
                        <div className="text-xs text-muted-foreground">
                            النظام يمنع الوصول للصفحات ويخفي الروابط والأزرار تلقائياً حسب الصلاحية
                        </div>
                    </div>
                </div>
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
                <span className="text-sm font-bold text-muted-foreground">عرض حسب الدور:</span>
                <button
                    onClick={() => setSelectedRole("ALL")}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${selectedRole === "ALL"
                        ? "bg-foreground text-background shadow-md"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                        }`}
                >
                    الكل
                </button>
                {Object.entries(roleLabels).map(([role, info]: any) => (
                    <button
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${selectedRole === role
                            ? `${info.bg} ${info.color} shadow-md`
                            : "bg-muted text-muted-foreground hover:bg-muted"
                            }`}
                    >
                        {info.name}
                    </button>
                ))}
            </div>

            {/* Categories Accordion */}
            <div className="space-y-3">
                {categories.map((cat: any) => {
                    const CatIcon = cat.icon;
                    const isExpanded = expandedCategory === cat.id;
                    const enabledCount = selectedRole !== "ALL"
                        ? cat.permissions.filter((p: any) => roleDefaults[selectedRole]?.[p.key]).length
                        : cat.permissions.length;

                    return (
                        <div
                            key={cat.id}
                            className={`rounded-2xl border overflow-hidden transition-all ${isExpanded ? `${cat.borderColor} shadow-md` : "border-border"
                                }`}
                        >
                            {/* Category Header */}
                            <button
                                onClick={() => toggleCategory(cat.id)}
                                className={`w-full flex items-center gap-3 p-4 text-right transition-colors ${isExpanded ? `${cat.bgColor}` : "bg-card hover:bg-muted"
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-xl ${cat.bgColor} ${cat.borderColor} border flex items-center justify-center shrink-0`}>
                                    <CatIcon className={`w-5 h-5 ${cat.color}`} />
                                </div>
                                <div className="flex-1 text-right">
                                    <div className={`font-bold ${isExpanded ? cat.color : "text-foreground"}`}>
                                        {cat.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {cat.permissions.length} صلاحية
                                        {selectedRole !== "ALL" && (
                                            <span className="mr-2">
                                                • <span className="text-success">{enabledCount} مفعّلة</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Role badges preview */}
                                {selectedRole === "ALL" && !isExpanded && (
                                    <div className="hidden sm:flex gap-1.5">
                                        {Object.entries(roleLabels).map(([role, info]: any) => {
                                            const enabled = cat.permissions.filter((p: any) => roleDefaults[role]?.[p.key]).length;
                                            return (
                                                <span key={role} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.bg} ${info.color}`}>
                                                    {info.name}: {enabled}/{cat.permissions.length}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                                )}
                            </button>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="bg-card divide-y divide-gray-100">
                                    {cat.permissions.map((perm: any) => {
                                        const isEnabled = selectedRole === "ALL" || roleDefaults[selectedRole]?.[perm.key];

                                        return (
                                            <div
                                                key={perm.key}
                                                className={`p-4 transition-colors ${selectedRole !== "ALL" && !isEnabled ? "opacity-40" : ""
                                                    }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    {/* Lock/Unlock icon */}
                                                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${perm.actionOnly ? "bg-muted" : cat.bgColor
                                                        }`}>
                                                        {perm.actionOnly ? (
                                                            <Lock className="w-4 h-4 text-muted-foreground" />
                                                        ) : (
                                                            <Eye className={`w-4 h-4 ${cat.color}`} />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        {/* Permission name + key */}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-foreground">{perm.label}</span>
                                                            <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                                                {perm.key}
                                                            </code>
                                                            {perm.actionOnly && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-bold">
                                                                    إجراء فقط
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Description */}
                                                        <p className="text-xs text-muted-foreground mt-0.5">{perm.description}</p>

                                                        {/* Pages */}
                                                        {perm.pages.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {perm.pages.map((page: any) => (
                                                                    <span
                                                                        key={page.path}
                                                                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border ${cat.bgColor} ${cat.borderColor} ${cat.color} font-medium`}
                                                                    >
                                                                        <Unlock className="w-3 h-3" />
                                                                        {page.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {perm.actionOnly && (
                                                            <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                                                                هذه الصلاحية تتحكم بزر أو إجراء داخل الصفحة — لا تمنع الوصول لصفحة كاملة
                                                            </p>
                                                        )}

                                                        {/* Role access matrix */}
                                                        {selectedRole === "ALL" && (
                                                            <div className="flex gap-2 mt-2">
                                                                {Object.entries(roleLabels).map(([role, info]: any) => {
                                                                    const enabled = roleDefaults[role]?.[perm.key];
                                                                    return (
                                                                        <div
                                                                            key={role}
                                                                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${enabled
                                                                                ? `${info.bg} ${info.color}`
                                                                                : "bg-muted text-muted-foreground"
                                                                                }`}
                                                                        >
                                                                            {enabled ? (
                                                                                <CheckCircle2 className="w-3 h-3" />
                                                                            ) : (
                                                                                <XCircle className="w-3 h-3" />
                                                                            )}
                                                                            {info.name}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer Note */}
            <div className="mt-8 p-4 bg-muted rounded-xl border border-border text-center">
                <p className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">ملاحظة:</span>{" "}
                    المدير (ADMIN) يتجاوز جميع الصلاحيات ويصل لكل شيء دائماً.
                    يمكن تعديل الصلاحيات لكل مستخدم بشكل فردي من{" "}
                    <a href="/dashboard/users/permissions" className="text-primary hover:underline font-bold">
                        صفحة إدارة الصلاحيات
                    </a>.
                </p>
            </div>
        </div>
    );
}
