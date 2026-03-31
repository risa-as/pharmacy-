"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Store,
    Pill,
    Package,
    ShoppingCart,
    BarChart3,
    Users,
    Shield,
    Zap,
    Globe,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    ArrowLeft,
    Smartphone,
    Bell,
    TrendingUp,
    Lock,
    Cloud,
    Laptop,
    RefreshCw,
    ClipboardList,
    Wallet,
    Receipt,
    Search,
    Star,
    UserCheck,
    Truck,
    FileText,
    AlertTriangle,
    CheckCircle,
    Database,
    Activity,
    CreditCard,
    Gift,
    Settings,
    Eye,
    PieChart,
    Calendar,
    Heart,
    Building2,
    ScanLine,
    Layers,
    ArrowRightLeft,
} from "lucide-react";

const ONBOARDING_KEY = "faramace_onboarding_completed";

const slides = [
    // ─── 01. Hero ───────────────────────────────────────────────────────────
    {
        id: "hero",
        gradient: "from-[#0f0c29] via-[#302b63] to-[#24243e]",
        accentColor: "#818cf8",
        badge: null,
        title: "فاراماس",
        subtitle: "مستقبل إدارة الصيدليات في العراق والمنطقة",
        description:
            "منظومة سحابية متكاملة تجمع بين الذكاء والسرعة والأمان — صُمِّمت خصيصاً لاحتياجات الصيدلية الحديثة بكل تفاصيلها.",
        features: [
            { icon: Cloud, text: "سحابي 100٪" },
            { icon: Zap, text: "استجابة فورية" },
            { icon: Lock, text: "تشفير عسكري" },
            { icon: Globe, text: "من أي مكان" },
        ],
        stats: [
            { value: "99.9٪", label: "وقت التشغيل" },
            { value: "< 1s", label: "سرعة الاستجابة" },
            { value: "24/7", label: "دعم مستمر" },
        ],
    },

    // ─── 02. Multi-Branch ───────────────────────────────────────────────────
    {
        id: "branches",
        gradient: "from-[#0f2027] via-[#203a43] to-[#2c5364]",
        accentColor: "#67e8f9",
        badge: "إدارة مركزية",
        title: "فروع بلا حدود",
        subtitle: "إمبراطوريتك الدوائية — من لوحة تحكم واحدة",
        description:
            "أدِر جميع فروعك في آنٍ واحد. لكل فرع مخزونه المستقل وأسعاره وموظفيه وتقاريره — مع رؤية مركزية شاملة تُمكِّنك من اتخاذ قرارات استراتيجية مبنية على بيانات حقيقية.",
        features: [
            { icon: Building2, text: "فروع غير محدودة" },
            { icon: ArrowRightLeft, text: "تحويل المخزون" },
            { icon: BarChart3, text: "مقارنة الفروع" },
            { icon: Shield, text: "عزل تام للبيانات" },
        ],
        stats: [
            { value: "∞", label: "عدد الفروع" },
            { value: "فوري", label: "المزامنة" },
            { value: "100٪", label: "عزل البيانات" },
        ],
    },

    // ─── 03. Drug Database ──────────────────────────────────────────────────
    {
        id: "drugs",
        gradient: "from-[#1a2a1a] via-[#0d3b0d] to-[#1a4a2e]",
        accentColor: "#4ade80",
        badge: "قاعدة بيانات ذكية",
        title: "قاعدة أدوية شاملة",
        subtitle: "كل دواء — اسمه التجاري والعلمي وباركوده في مكان واحد",
        description:
            "قاعدة بيانات مركزية موحَّدة لجميع الأدوية. أضف الدواء مرة واحدة بالاسم التجاري والعلمي والباركود والصورة — وسيكون متاحاً فوراً لجميع فروعك دون إعادة إدخال.",
        features: [
            { icon: ScanLine, text: "مسح الباركود" },
            { icon: Search, text: "بحث فوري بالاسم" },
            { icon: Globe, text: "مشاركة بين الفروع" },
            { icon: AlertTriangle, text: "تحذيرات التفاعلات" },
        ],
        stats: [
            { value: "DDI", label: "كشف التفاعلات" },
            { value: "فوري", label: "البحث" },
            { value: "QR+", label: "دعم الباركود" },
        ],
    },

    // ─── 04. Inventory & Batches ────────────────────────────────────────────
    {
        id: "inventory",
        gradient: "from-[#2d1b00] via-[#4a2c00] to-[#3d2200]",
        accentColor: "#fb923c",
        badge: "مخزون ذكي",
        title: "تحكّم كامل بكل حبة دواء",
        subtitle: "دُفعات — صلاحية — تكلفة — حد أدنى وأقصى",
        description:
            "نظام دُفعات (Batches) متكامل يتتبع كل دفعة بتاريخ انتهاء الصلاحية ورقم الدُفعة والمورّد وسعر التكلفة. نظام FEFO تلقائي يضمن بيع الأقرب للانتهاء أولاً — دون أي تدخّل يدوي.",
        features: [
            { icon: Layers, text: "إدارة الدفعات FEFO" },
            { icon: Bell, text: "تنبيه انتهاء الصلاحية" },
            { icon: AlertTriangle, text: "تنبيه نقص المخزون" },
            { icon: Package, text: "جرد دوري" },
        ],
        stats: [
            { value: "FEFO", label: "نظام الإخراج" },
            { value: "تلقائي", label: "تنبيه الصلاحية" },
            { value: "0 هدر", label: "الهدف" },
        ],
    },

    // ─── 05. POS ────────────────────────────────────────────────────────────
    {
        id: "pos",
        gradient: "from-[#1a1a3e] via-[#2d1b69] to-[#1a0a3e]",
        accentColor: "#c084fc",
        badge: "نقطة البيع",
        title: "بيع بسرعة البرق",
        subtitle: "فاتورة كاملة في أقل من 10 ثوانٍ",
        description:
            "واجهة POS مُحسَّنة للسرعة: مسح الباركود → اختيار الكمية → دفع. دعم كامل لطرق الدفع المتعددة: نقداً، آجل، زين كاش. خصومات مرنة مع صلاحيات محكمة.",
        features: [
            { icon: Zap, text: "< 10 ثوانٍ للفاتورة" },
            { icon: CreditCard, text: "دفع إلكتروني" },
            { icon: UserCheck, text: "ربط بالمريض" },
            { icon: Receipt, text: "فاتورة طباعة فورية" },
        ],
        stats: [
            { value: "< 10s", label: "زمن الفاتورة" },
            { value: "3 طرق", label: "طرق الدفع" },
            { value: "فوري", label: "خصم المخزون" },
        ],
    },

    // ─── 06. Returns ────────────────────────────────────────────────────────
    {
        id: "returns",
        gradient: "from-[#3b0f0f] via-[#5c1a1a] to-[#3b0f0f]",
        accentColor: "#f87171",
        badge: "إدارة المرتجعات",
        title: "مرتجعات بلا فوضى",
        subtitle: "استرداد المبيعات بدقة وشفافية تامة",
        description:
            "نظام مرتجعات محكم يُعيد الأصناف إلى المخزون تلقائياً، يُعدِّل رصيد الصندوق، ويُسجِّل العملية في سجل التدقيق — مع صلاحيات مستقلة تمنع الاستخدام غير المصرَّح به.",
        features: [
            { icon: RefreshCw, text: "إعادة المخزون تلقائياً" },
            { icon: Wallet, text: "تعديل الصندوق" },
            { icon: Shield, text: "صلاحية مستقلة" },
            { icon: FileText, text: "سجل مرتجعات كامل" },
        ],
        stats: [
            { value: "تلقائي", label: "إعادة المخزون" },
            { value: "فوري", label: "تعديل الصندوق" },
            { value: "100٪", label: "الشفافية" },
        ],
    },

    // ─── 07. Patients ───────────────────────────────────────────────────────
    {
        id: "patients",
        gradient: "from-[#0c2340] via-[#0d3b5e] to-[#0a2a4a]",
        accentColor: "#38bdf8",
        badge: "رعاية المرضى",
        title: "ملف مريض متكامل",
        subtitle: "تاريخ طبي كامل — في ثانية واحدة",
        description:
            "لكل مريض ملف شامل: الأمراض المزمنة، الحساسية للأدوية، تاريخ الوصفات والمشتريات، ورصيد الديون. استدعِ الملف بسرعة عند البيع لتجنّب التفاعلات الدوائية.",
        features: [
            { icon: Heart, text: "الأمراض المزمنة" },
            { icon: AlertTriangle, text: "تنبيه الحساسية" },
            { icon: ClipboardList, text: "تاريخ الوصفات" },
            { icon: Wallet, text: "رصيد الديون" },
        ],
        stats: [
            { value: "فوري", label: "استدعاء الملف" },
            { value: "آمن", label: "حفظ البيانات" },
            { value: "كامل", label: "التاريخ الطبي" },
        ],
    },

    // ─── 08. Debts / Credit ─────────────────────────────────────────────────
    {
        id: "debts",
        gradient: "from-[#1a0a2e] via-[#2d1050] to-[#1a0a2e]",
        accentColor: "#a78bfa",
        badge: "إدارة الديون",
        title: "لا دَين يضيع",
        subtitle: "تتبّع كل مبلغ — من أول فاتورة حتى السداد الكامل",
        description:
            "كشف حساب تفصيلي لكل مريض ومورّد. سجّل الدفعات الجزئية، تتبّع التواريخ، وأصدر إشعارات للمستحقات. لا مبلغ يُنسى ولا حساب يضيع.",
        features: [
            { icon: Wallet, text: "كشف حساب تفصيلي" },
            { icon: Calendar, text: "تواريخ الاستحقاق" },
            { icon: CheckCircle, text: "دفعات جزئية" },
            { icon: Bell, text: "تذكير بالديون" },
        ],
        stats: [
            { value: "تفصيلي", label: "كشف الحساب" },
            { value: "فوري", label: "تسجيل الدفع" },
            { value: "0", label: "ضياع الأموال" },
        ],
    },

    // ─── 09. Suppliers ──────────────────────────────────────────────────────
    {
        id: "suppliers",
        gradient: "from-[#0f1f0f] via-[#1a3a1a] to-[#0f2a1a]",
        accentColor: "#86efac",
        badge: "إدارة الموردين",
        title: "علاقات موردين منظّمة",
        subtitle: "من طلب الشراء حتى الاستلام — بدون ورق",
        description:
            "أدِر جميع موردِيك بكشوف حسابات مفصّلة، سجِّل فواتير الشراء، وتابع الرصيد المستحق. نظام أوامر الشراء الذكي يقترح الكميات المثلى بناءً على حركة المبيعات وحدود المخزون.",
        features: [
            { icon: Truck, text: "أوامر شراء ذكية" },
            { icon: Receipt, text: "فواتير الشراء" },
            { icon: Wallet, text: "رصيد الموردين" },
            { icon: ClipboardList, text: "سجل المعاملات" },
        ],
        stats: [
            { value: "ذكي", label: "اقتراح الطلبات" },
            { value: "كامل", label: "كشف الحساب" },
            { value: "تلقائي", label: "تحديث المخزون" },
        ],
    },

    // ─── 10. Transfers ──────────────────────────────────────────────────────
    {
        id: "transfers",
        gradient: "from-[#002040] via-[#003060] to-[#001a3a]",
        accentColor: "#7dd3fc",
        badge: "تحويل المخزون",
        title: "توازن المخزون بين الفروع",
        subtitle: "فرع يفيض — وآخر ينقص؟ المشكلة محلولة",
        description:
            "حوِّل الأدوية بين فروعك بنقرات معدودة. نظام طلب ← إرسال ← استلام يضمن المساءلة الكاملة في كل خطوة — مع تحديث فوري للمخزون في كلا الفرعين.",
        features: [
            { icon: ArrowRightLeft, text: "تحويل بين الفروع" },
            { icon: CheckCircle, text: "تأكيد الاستلام" },
            { icon: Eye, text: "تتبع الشحنة" },
            { icon: FileText, text: "سند التحويل" },
        ],
        stats: [
            { value: "فوري", label: "تحديث المخزون" },
            { value: "محاسَب", label: "كل تحويل" },
            { value: "مؤرشَف", label: "كل عملية" },
        ],
    },

    // ─── 11. Stocktake ──────────────────────────────────────────────────────
    {
        id: "stocktake",
        gradient: "from-[#1a1500] via-[#332900] to-[#1a1500]",
        accentColor: "#fbbf24",
        badge: "الجرد الدوري",
        title: "جرد لحظي بلا أخطاء",
        subtitle: "قارن الواقع بالنظام — وصحِّح الفروقات فوراً",
        description:
            "نظام جرد رقمي كامل: امسح الأصناف، سجِّل الكميات الفعلية، وسيحسب النظام الفروقات تلقائياً. الخسائر تُسجَّل كمصروف، والفروقات تُصحَّح في المخزون مباشرة — مع تقرير مفصّل لكل جردة.",
        features: [
            { icon: ScanLine, text: "جرد بالباركود" },
            { icon: Activity, text: "فروقات تلقائية" },
            { icon: Receipt, text: "تسجيل الخسائر" },
            { icon: FileText, text: "تقرير الجردة" },
        ],
        stats: [
            { value: "دقيق", label: "حساب الفروقات" },
            { value: "تلقائي", label: "تصحيح المخزون" },
            { value: "مؤرشَف", label: "كل جردة" },
        ],
    },

    // ─── 12. Expenses ───────────────────────────────────────────────────────
    {
        id: "expenses",
        gradient: "from-[#2a0a0a] via-[#4a1515] to-[#2a0a0a]",
        accentColor: "#fca5a5",
        badge: "إدارة المصروفات",
        title: "كل مصروف في مكانه",
        subtitle: "راتب — إيجار — صيانة — كلها تحت السيطرة",
        description:
            "سجِّل جميع مصروفات الفرع بالتصنيفات والتواريخ والمبالغ. تُدرَج المصروفات تلقائياً في حسابات الأرباح والخسائر لتحصل على صورة مالية حقيقية 100٪ عن أداء صيدليتك.",
        features: [
            { icon: Receipt, text: "تصنيف المصروفات" },
            { icon: Calendar, text: "تتبع تاريخي" },
            { icon: PieChart, text: "أثر على الربح" },
            { icon: Wallet, text: "تقرير مالي كامل" },
        ],
        stats: [
            { value: "دقيق", label: "حساب الربح" },
            { value: "مصنَّف", label: "كل مصروف" },
            { value: "فوري", label: "التقرير المالي" },
        ],
    },

    // ─── 13. Reports ────────────────────────────────────────────────────────
    {
        id: "reports",
        gradient: "from-[#0c1445] via-[#1a237e] to-[#0d1b52]",
        accentColor: "#60a5fa",
        badge: "تحليلات متقدمة",
        title: "تقارير تتحدث بالأرقام",
        subtitle: "قرارات مبنية على البيانات — لا على التخمين",
        description:
            "تقارير شاملة: مبيعات يومية/شهرية، أرباح صافية، أداء الموظفين، حركة المخزون، الأدوية الأكثر مبيعاً، مقارنة الفروع. تصدير PDF و Excel بضغطة واحدة.",
        features: [
            { icon: TrendingUp, text: "تقرير الأرباح" },
            { icon: Users, text: "أداء الموظفين" },
            { icon: BarChart3, text: "مقارنة الفروع" },
            { icon: Globe, text: "تصدير PDF/Excel" },
        ],
        stats: [
            { value: "شامل", label: "8+ أنواع تقارير" },
            { value: "Excel", label: "تصدير مفصّل" },
            { value: "لحظي", label: "تحديث البيانات" },
        ],
    },

    // ─── 14. Safe / Cash Management ─────────────────────────────────────────
    {
        id: "safe",
        gradient: "from-[#0a1a0a] via-[#0f2e0f] to-[#0a1f0a]",
        accentColor: "#34d399",
        badge: "إدارة الصندوق",
        title: "صندوق الفرع تحت المجهر",
        subtitle: "كل دينار يدخل — وكل دينار يخرج — موثَّق",
        description:
            "نظام صندوق نقدي متكامل: كل عملية بيع تُضاف تلقائياً، كل مصروف يُخصَم فوراً، وكل مرتجع يُعدَّل في الحال. سجِّل شيفتات الدوام وأقفل الصندوق في نهاية كل وردية.",
        features: [
            { icon: Wallet, text: "رصيد لحظي" },
            { icon: Activity, text: "سجل المعاملات" },
            { icon: Calendar, text: "شيفتات الدوام" },
            { icon: Lock, text: "إقفال الصندوق" },
        ],
        stats: [
            { value: "لحظي", label: "الرصيد" },
            { value: "موثَّق", label: "كل معاملة" },
            { value: "مراجَع", label: "إقفال الوردية" },
        ],
    },

    // ─── 15. Desktop App ────────────────────────────────────────────────────
    {
        id: "desktop",
        gradient: "from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a]",
        accentColor: "#a5b4fc",
        badge: "تطبيق سطح المكتب",
        title: "يعمل حتى بدون إنترنت",
        subtitle: "انقطع الإنترنت؟ العمل لا يتوقف.",
        description:
            "تطبيق Electron متكامل للحاسوب يعمل بشكل كامل offline: بيع، جرد، إضافة دفعات. وعند عودة الإنترنت، تتم المزامنة التلقائية مع السحابة دون فقدان أي بيانات.",
        features: [
            { icon: Laptop, text: "يعمل بدون إنترنت" },
            { icon: RefreshCw, text: "مزامنة تلقائية" },
            { icon: Database, text: "قاعدة بيانات محلية" },
            { icon: Shield, text: "لا فقدان للبيانات" },
        ],
        stats: [
            { value: "Offline", label: "يعمل دائماً" },
            { value: "تلقائي", label: "المزامنة" },
            { value: "صفر", label: "ضياع البيانات" },
        ],
    },

    // ─── 16. User Roles & Permissions ──────────────────────────────────────
    {
        id: "permissions",
        gradient: "from-[#1a0d00] via-[#2e1800] to-[#1a0d00]",
        accentColor: "#fdba74",
        badge: "صلاحيات محكمة",
        title: "كل موظف بصلاحياته فقط",
        subtitle: "أدمن — مدير فرع — صيدلاني — كاشير",
        description:
            "نظام صلاحيات متعدد المستويات: 31 صلاحية مستقلة قابلة للتفعيل والتعطيل لكل موظف. لا يرى الكاشير الأرباح، ولا يملك الصيدلاني حق حذف الفواتير — إلا من تأذن له.",
        features: [
            { icon: Users, text: "4 أدوار رئيسية" },
            { icon: Settings, text: "31 صلاحية مستقلة" },
            { icon: Eye, text: "تحكم دقيق بالرؤية" },
            { icon: Shield, text: "حماية من التلاعب" },
        ],
        stats: [
            { value: "31", label: "صلاحية مستقلة" },
            { value: "4", label: "أدوار محددة" },
            { value: "آمن", label: "من التلاعب" },
        ],
    },

    // ─── 17. Audit Log ──────────────────────────────────────────────────────
    {
        id: "audit",
        gradient: "from-[#0a0a1e] via-[#15153a] to-[#0a0a1e]",
        accentColor: "#818cf8",
        badge: "سجل التدقيق",
        title: "لا شيء يحدث في الخفاء",
        subtitle: "كل فعل موثَّق — من فعله ومتى وأين",
        description:
            "سجل تدقيق شامل يُسجِّل كل عملية: من أضاف دواءً، من حذف فاتورة، من عدَّل سعراً، من غيَّر صلاحية. بحث وتصفية متقدمة بالتاريخ والمستخدم والفرع والنوع.",
        features: [
            { icon: Eye, text: "تتبع كل عملية" },
            { icon: Users, text: "تحديد المسؤول" },
            { icon: Search, text: "بحث وتصفية متقدمة" },
            { icon: Shield, text: "لا يمكن تعديله" },
        ],
        stats: [
            { value: "كامل", label: "تسجيل العمليات" },
            { value: "محمي", label: "من التعديل" },
            { value: "دائم", label: "الأرشفة" },
        ],
    },

    // ─── 18. Backup & Security ──────────────────────────────────────────────
    {
        id: "backup",
        gradient: "from-[#0f1a0f] via-[#1a2e1a] to-[#0f1a0f]",
        accentColor: "#86efac",
        badge: "أمان البيانات",
        title: "بياناتك محمية — دائماً",
        subtitle: "نسخ احتياطي — استعادة — تشفير",
        description:
            "نسخ احتياطي كامل لجميع بيانات المنظومة بضغطة واحدة. استعادة فورية من أي نسخة سابقة. التشفير من طرف إلى طرف يضمن أن بياناتك لا تصل إلى أحد غيرك.",
        features: [
            { icon: Database, text: "نسخ احتياطي كامل" },
            { icon: RefreshCw, text: "استعادة فورية" },
            { icon: Lock, text: "تشفير كامل" },
            { icon: Cloud, text: "تخزين سحابي آمن" },
        ],
        stats: [
            { value: "كامل", label: "النسخ الاحتياطي" },
            { value: "فوري", label: "الاستعادة" },
            { value: "مشفَّر", label: "البيانات" },
        ],
    },

    // ─── 19. Loyalty System ─────────────────────────────────────────────────
    {
        id: "loyalty",
        gradient: "from-[#1a0a2e] via-[#2d1050] to-[#1a0a2e]",
        accentColor: "#e879f9",
        badge: "نظام الولاء",
        title: "اكسب ولاء زبائنك",
        subtitle: "نقاط — مكافآت — عروض مخصصة",
        description:
            "نظام ولاء متكامل: يكسب الزبون نقاطاً مع كل عملية شراء، ويستبدلها بخصومات في مشترياته القادمة. عزِّز علاقتك بزبائنك وارفع نسبة العودة بشكل ملموس.",
        features: [
            { icon: Star, text: "نقاط مع كل شراء" },
            { icon: Gift, text: "استبدال المكافآت" },
            { icon: TrendingUp, text: "ترتيب المتصدرين" },
            { icon: Smartphone, text: "رصيد النقاط" },
        ],
        stats: [
            { value: "+٣٠٪", label: "معدل العودة" },
            { value: "فوري", label: "رصيد النقاط" },
            { value: "مرن", label: "نسبة الكسب" },
        ],
    },

    // ─── 20. Alerts & Notifications ─────────────────────────────────────────
    {
        id: "alerts",
        gradient: "from-[#1e0f00] via-[#3a1e00] to-[#1e0f00]",
        accentColor: "#fcd34d",
        badge: "التنبيهات الذكية",
        title: "كن دائماً على علم",
        subtitle: "النظام يراقب — وأنت تأخذ قرارات",
        description:
            "منظومة تنبيهات ذكية في الوقت الفعلي: أدوية قاربت على الانتهاء، مخزون وصل للحد الأدنى، ديون مستحقة، طلبات شراء معلّقة. لا تفوِّت أي تفصيل يؤثر على عملك.",
        features: [
            { icon: Bell, text: "تنبيه انتهاء الصلاحية" },
            { icon: Package, text: "نقص المخزون" },
            { icon: Wallet, text: "الديون المستحقة" },
            { icon: Activity, text: "لوحة التنبيهات" },
        ],
        stats: [
            { value: "فوري", label: "التنبيه" },
            { value: "ذكي", label: "التصفية" },
            { value: "قابل", label: "للتخصيص" },
        ],
    },

    // ─── 21. CTA ────────────────────────────────────────────────────────────
    {
        id: "cta",
        gradient: "from-[#0f0c29] via-[#302b63] to-[#24243e]",
        accentColor: "#818cf8",
        badge: null,
        title: "ابدأ رحلتك مع فاراماس",
        subtitle: "صيدليتك تستحق نظاماً بمستوى طموحاتك",
        description:
            "من الفرع الواحد إلى الشبكة الكاملة — فاراماس يكبر معك. أضف فروعك، سجِّل الأدوية، وابدأ البيع خلال دقائق. فريق الدعم معك في كل خطوة.",
        features: null,
        stats: null,
    },
];

export default function OnboardingTour() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [animating, setAnimating] = useState(false);
    const [direction, setDirection] = useState<"next" | "prev">("next");
    const [countersVisible, setCountersVisible] = useState(false);

    useEffect(() => {
        setMounted(true);
        const completed = localStorage.getItem(ONBOARDING_KEY);
        if (!completed) {
            setIsOpen(true);
            setTimeout(() => setCountersVisible(true), 600);
        }
    }, []);

    const goToSlide = useCallback(
        (index: number, dir: "next" | "prev") => {
            if (animating) return;
            setAnimating(true);
            setDirection(dir);
            setCountersVisible(false);
            setTimeout(() => {
                setCurrentSlide(index);
                setAnimating(false);
                setTimeout(() => setCountersVisible(true), 300);
            }, 350);
        },
        [animating]
    );

    const handleNext = () => {
        if (currentSlide < slides.length - 1) {
            goToSlide(currentSlide + 1, "next");
        } else {
            handleClose();
        }
    };

    const handlePrev = () => {
        if (currentSlide > 0) {
            goToSlide(currentSlide - 1, "prev");
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        localStorage.setItem(ONBOARDING_KEY, "true");
    };

    if (!mounted || !isOpen) return null;

    const slide = slides[currentSlide];
    const isLastSlide = currentSlide === slides.length - 1;
    const isFirstSlide = currentSlide === 0;
    const progress = ((currentSlide + 1) / slides.length) * 100;

    return (
        <>
            <style jsx global>{`
                @keyframes float-orb {
                    0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.15; }
                    33% { transform: translateY(-30px) rotate(120deg); opacity: 0.25; }
                    66% { transform: translateY(15px) rotate(240deg); opacity: 0.1; }
                }
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes slide-up {
                    from { transform: translateY(40px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes slide-down-out {
                    from { transform: translateY(0); opacity: 1; }
                    to { transform: translateY(-40px); opacity: 0; }
                }
                @keyframes scale-in {
                    from { transform: scale(0.85); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                @keyframes glow-pulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(129,140,248,0.3); }
                    50% { box-shadow: 0 0 50px rgba(129,140,248,0.7); }
                }
                @keyframes progress-fill {
                    from { width: 0%; }
                }
                .onb-slide-enter { animation: slide-up 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
                .onb-slide-exit { animation: slide-down-out 0.35s cubic-bezier(0.7,0,0.84,0) forwards; }
                .onb-scale-in { animation: scale-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
                .onb-shimmer {
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
                    background-size: 200% 100%;
                    animation: shimmer 3s infinite;
                }
                .onb-stagger-1 { animation-delay: 0.08s; }
                .onb-stagger-2 { animation-delay: 0.16s; }
                .onb-stagger-3 { animation-delay: 0.24s; }
                .onb-stagger-4 { animation-delay: 0.32s; }
            `}</style>

            <div className="fixed inset-0 z-[9999] overflow-hidden" dir="rtl">
                {/* Animated Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} transition-all duration-700`}>
                    <div
                        className="absolute top-[8%] right-[12%] w-80 h-80 rounded-full blur-3xl"
                        style={{ background: slide.accentColor, animation: "float-orb 9s ease-in-out infinite", opacity: 0.12 }}
                    />
                    <div
                        className="absolute bottom-[15%] left-[8%] w-96 h-96 rounded-full blur-3xl"
                        style={{ background: slide.accentColor, animation: "float-orb 13s ease-in-out infinite 2s", opacity: 0.08 }}
                    />
                    <div
                        className="absolute top-[55%] left-[55%] w-56 h-56 rounded-full blur-3xl"
                        style={{ background: slide.accentColor, animation: "float-orb 11s ease-in-out infinite 4s", opacity: 0.1 }}
                    />
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)`,
                            backgroundSize: "40px 40px",
                        }}
                    />
                </div>

                {/* Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-10">
                    <div
                        className="h-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${slide.accentColor}80, ${slide.accentColor})` }}
                    />
                </div>

                {/* Content */}
                <div className="relative h-full flex flex-col items-center justify-center p-6">
                    {/* Skip Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-6 left-6 text-white/40 hover:text-white/80 text-sm font-medium transition-all hover:bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10 z-10"
                    >
                        تخطي ✕
                    </button>

                    {/* Slide Counter */}
                    <div className="absolute top-6 right-6 z-10">
                        <span
                            className="text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-md border border-white/15"
                            style={{ background: `${slide.accentColor}15`, color: slide.accentColor }}
                        >
                            {currentSlide + 1} / {slides.length}
                        </span>
                    </div>

                    {/* Main Content */}
                    <div
                        key={currentSlide}
                        className={`max-w-4xl w-full text-center ${animating ? "onb-slide-exit" : "onb-slide-enter"}`}
                    >
                        {/* Badge */}
                        {slide.badge && (
                            <div
                                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black mb-5 backdrop-blur-md border border-white/20 uppercase tracking-widest"
                                style={{ background: `${slide.accentColor}18`, color: slide.accentColor }}
                            >
                                <Sparkles className="w-3 h-3" />
                                {slide.badge}
                            </div>
                        )}

                        {/* Title */}
                        {isFirstSlide ? (
                            <div className="mb-5">
                                <h1
                                    className="text-7xl md:text-9xl font-black text-white tracking-tight mb-3"
                                    style={{ textShadow: `0 0 100px ${slide.accentColor}50` }}
                                >
                                    {slide.title}
                                </h1>
                                <div
                                    className="h-px w-32 mx-auto mb-4"
                                    style={{ background: `linear-gradient(90deg, transparent, ${slide.accentColor}, transparent)` }}
                                />
                                <p
                                    className="text-xl md:text-2xl font-bold bg-clip-text text-transparent"
                                    style={{ backgroundImage: `linear-gradient(135deg, white 40%, ${slide.accentColor})` }}
                                >
                                    {slide.subtitle}
                                </p>
                            </div>
                        ) : isLastSlide ? (
                            <div className="mb-5">
                                <h1
                                    className="text-4xl md:text-6xl font-black text-white tracking-tight mb-3"
                                    style={{ textShadow: `0 0 80px ${slide.accentColor}40` }}
                                >
                                    {slide.title}
                                </h1>
                                <p className="text-lg md:text-2xl font-bold" style={{ color: slide.accentColor }}>
                                    {slide.subtitle}
                                </p>
                            </div>
                        ) : (
                            <div className="mb-5">
                                <h1
                                    className="text-4xl md:text-6xl font-black text-white tracking-tight mb-3"
                                    style={{ textShadow: `0 0 60px ${slide.accentColor}30` }}
                                >
                                    {slide.title}
                                </h1>
                                <p className="text-base md:text-xl font-bold" style={{ color: slide.accentColor }}>
                                    {slide.subtitle}
                                </p>
                            </div>
                        )}

                        {/* Description */}
                        <p className="text-white/60 text-base md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
                            {slide.description}
                        </p>

                        {/* Features Grid */}
                        {slide.features && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 max-w-3xl mx-auto">
                                {slide.features.map((feature: any, i: number) => {
                                    const FeatureIcon = feature.icon;
                                    return (
                                        <div
                                            key={i}
                                            className={`onb-scale-in onb-stagger-${i + 1} group relative p-4 rounded-2xl backdrop-blur-md border border-white/10 hover:border-white/25 transition-all duration-300 cursor-default hover:scale-105`}
                                            style={{ background: "rgba(255,255,255,0.05)" }}
                                        >
                                            <div className="absolute inset-0 rounded-2xl onb-shimmer" />
                                            <div className="relative">
                                                <div
                                                    className="w-10 h-10 mx-auto mb-2.5 rounded-xl flex items-center justify-center"
                                                    style={{ background: `${slide.accentColor}20` }}
                                                >
                                                    <FeatureIcon className="w-5 h-5" style={{ color: slide.accentColor }} />
                                                </div>
                                                <p className="text-white/80 text-xs font-bold leading-tight">{feature.text}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Stats */}
                        {slide.stats && (
                            <div className="flex justify-center gap-10 md:gap-24 mb-8">
                                {slide.stats.map((stat: any, i: number) => (
                                    <div
                                        key={i}
                                        className={`text-center transition-all duration-500 ${countersVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                                        style={{ transitionDelay: `${i * 120}ms` }}
                                    >
                                        <div
                                            className="text-2xl md:text-4xl font-black mb-2"
                                            style={{ color: slide.accentColor }}
                                        >
                                            {stat.value}
                                        </div>
                                        <div className="text-white/40 text-xs font-bold uppercase tracking-wider">
                                            {stat.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* CTA for last slide */}
                        {isLastSlide && (
                            <div className="flex flex-col items-center gap-4 mt-6">
                                <button
                                    onClick={handleClose}
                                    className="group relative px-12 py-4 text-lg font-black text-white rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95"
                                    style={{
                                        background: `linear-gradient(135deg, ${slide.accentColor}, ${slide.accentColor}bb)`,
                                        animation: "glow-pulse 2.5s infinite",
                                    }}
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        ابدأ استخدام فاراماس الآن
                                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                                    </span>
                                </button>
                                <p className="text-white/30 text-sm">يمكنك إعادة عرض هذه الجولة في أي وقت من الإعدادات</p>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-8 max-w-5xl mx-auto">
                        {/* Prev */}
                        <button
                            onClick={handlePrev}
                            disabled={isFirstSlide}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white/50 hover:text-white disabled:opacity-0 disabled:cursor-default transition-all rounded-xl hover:bg-white/10 backdrop-blur-sm"
                        >
                            <ChevronRight className="w-4 h-4" />
                            السابق
                        </button>

                        {/* Dots — show compact version for many slides */}
                        <div className="flex items-center gap-1.5">
                            {slides.map((_: any, i: number) => {
                                const isActive = i === currentSlide;
                                const isNear = Math.abs(i - currentSlide) <= 2;
                                const isFar = Math.abs(i - currentSlide) > 4;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => goToSlide(i, i > currentSlide ? "next" : "prev")}
                                        className="transition-all duration-300 rounded-full flex-shrink-0"
                                        style={{
                                            width: isActive ? "28px" : isNear ? "7px" : "5px",
                                            height: isActive ? "7px" : isNear ? "7px" : "5px",
                                            background: isActive
                                                ? slide.accentColor
                                                : i < currentSlide
                                                ? `${slide.accentColor}50`
                                                : "rgba(255,255,255,0.2)",
                                            opacity: isFar ? 0.4 : 1,
                                        }}
                                    />
                                );
                            })}
                        </div>

                        {/* Next */}
                        <button
                            onClick={handleNext}
                            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all duration-300 hover:scale-105 active:scale-95"
                            style={{
                                background: `${slide.accentColor}25`,
                                border: `1px solid ${slide.accentColor}50`,
                            }}
                        >
                            {isLastSlide ? "ابدأ الآن" : "التالي"}
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
