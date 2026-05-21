"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Pill, Package, ShoppingCart, BarChart3, Users, Shield, Zap,
    Globe, ChevronLeft, ChevronRight, Sparkles, ArrowLeft, Smartphone,
    Bell, TrendingUp, Lock, Cloud, Laptop, RefreshCw, ClipboardList,
    Wallet, Receipt, Search, Star, UserCheck, Truck, FileText,
    AlertTriangle, CheckCircle, Database, Activity, CreditCard, Gift,
    Settings, Eye, PieChart, Calendar, Heart, Building2, ScanLine,
    Layers, ArrowRightLeft, Check, Bot, Brain, MessageSquare, Wand2,
} from "lucide-react";

const ONBOARDING_KEY = "faramace_onboarding_completed";

type Feature = { icon: React.ElementType; text: string };
type Stat = { value: string; label: string };
type Slide = {
    id: string;
    gradient: string;
    accentColor: string;
    badge: string | null;
    sidebarTitle: string;
    mainIcon: React.ElementType;
    title: string;
    subtitle: string;
    description: string;
    features: Feature[] | null;
    stats: Stat[] | null;
};

const slides: Slide[] = [
    {
        id: "hero",
        gradient: "from-[#0f0c29] via-[#302b63] to-[#24243e]",
        accentColor: "#818cf8",
        badge: null,
        sidebarTitle: "مرحباً بك",
        mainIcon: Sparkles,
        title: "فاراماس",
        subtitle: "مستقبل إدارة الصيدليات في العراق والمنطقة",
        description: "منظومة سحابية متكاملة تجمع بين الذكاء والسرعة والأمان — صُمِّمت خصيصاً لاحتياجات الصيدلية الحديثة بكل تفاصيلها.",
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
    {
        id: "branches",
        gradient: "from-[#0f2027] via-[#203a43] to-[#2c5364]",
        accentColor: "#67e8f9",
        badge: "إدارة مركزية",
        sidebarTitle: "إدارة الفروع",
        mainIcon: Building2,
        title: "فروع بلا حدود",
        subtitle: "إمبراطوريتك الدوائية — من لوحة تحكم واحدة",
        description: "أدِر جميع فروعك في آنٍ واحد. لكل فرع مخزونه المستقل وأسعاره وموظفيه وتقاريره — مع رؤية مركزية شاملة تُمكِّنك من اتخاذ قرارات استراتيجية مبنية على بيانات حقيقية.",
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
    {
        id: "drugs",
        gradient: "from-[#1a2a1a] via-[#0d3b0d] to-[#1a4a2e]",
        accentColor: "#4ade80",
        badge: "قاعدة بيانات ذكية",
        sidebarTitle: "قاعدة الأدوية",
        mainIcon: Pill,
        title: "قاعدة أدوية شاملة",
        subtitle: "كل دواء — اسمه التجاري والعلمي وباركوده في مكان واحد",
        description: "قاعدة بيانات مركزية موحَّدة لجميع الأدوية. أضف الدواء مرة واحدة بالاسم التجاري والعلمي والباركود والصورة — وسيكون متاحاً فوراً لجميع فروعك دون إعادة إدخال.",
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
    {
        id: "inventory",
        gradient: "from-[#2d1b00] via-[#4a2c00] to-[#3d2200]",
        accentColor: "#fb923c",
        badge: "مخزون ذكي",
        sidebarTitle: "المخزون والدفعات",
        mainIcon: Package,
        title: "تحكّم كامل بكل حبة دواء",
        subtitle: "دُفعات — صلاحية — تكلفة — حد أدنى وأقصى",
        description: "نظام دُفعات (Batches) متكامل يتتبع كل دفعة بتاريخ انتهاء الصلاحية ورقم الدُفعة والمورّد وسعر التكلفة. نظام FEFO تلقائي يضمن بيع الأقرب للانتهاء أولاً — دون أي تدخّل يدوي.",
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
    {
        id: "pos",
        gradient: "from-[#1a1a3e] via-[#2d1b69] to-[#1a0a3e]",
        accentColor: "#c084fc",
        badge: "نقطة البيع",
        sidebarTitle: "نقطة البيع POS",
        mainIcon: ShoppingCart,
        title: "بيع بسرعة البرق",
        subtitle: "فاتورة كاملة في أقل من 10 ثوانٍ",
        description: "واجهة POS مُحسَّنة للسرعة: مسح الباركود → اختيار الكمية → دفع. دعم كامل لطرق الدفع المتعددة: نقداً، آجل، زين كاش. خصومات مرنة مع صلاحيات محكمة.",
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
    {
        id: "returns",
        gradient: "from-[#3b0f0f] via-[#5c1a1a] to-[#3b0f0f]",
        accentColor: "#f87171",
        badge: "إدارة المرتجعات",
        sidebarTitle: "المرتجعات",
        mainIcon: RefreshCw,
        title: "مرتجعات بلا فوضى",
        subtitle: "استرداد المبيعات بدقة وشفافية تامة",
        description: "نظام مرتجعات محكم يُعيد الأصناف إلى المخزون تلقائياً، يُعدِّل رصيد الصندوق، ويُسجِّل العملية في سجل التدقيق — مع صلاحيات مستقلة تمنع الاستخدام غير المصرَّح به.",
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
    {
        id: "patients",
        gradient: "from-[#0c2340] via-[#0d3b5e] to-[#0a2a4a]",
        accentColor: "#38bdf8",
        badge: "رعاية المرضى",
        sidebarTitle: "ملفات المرضى",
        mainIcon: Heart,
        title: "ملف مريض متكامل",
        subtitle: "تاريخ طبي كامل — في ثانية واحدة",
        description: "لكل مريض ملف شامل: الأمراض المزمنة، الحساسية للأدوية، تاريخ الوصفات والمشتريات، ورصيد الديون. استدعِ الملف بسرعة عند البيع لتجنّب التفاعلات الدوائية.",
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
    {
        id: "debts",
        gradient: "from-[#1a0a2e] via-[#2d1050] to-[#1a0a2e]",
        accentColor: "#a78bfa",
        badge: "إدارة الديون",
        sidebarTitle: "إدارة الديون",
        mainIcon: CreditCard,
        title: "لا دَين يضيع",
        subtitle: "تتبّع كل مبلغ — من أول فاتورة حتى السداد الكامل",
        description: "كشف حساب تفصيلي لكل مريض ومورّد. سجّل الدفعات الجزئية، تتبّع التواريخ، وأصدر إشعارات للمستحقات. لا مبلغ يُنسى ولا حساب يضيع.",
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
    {
        id: "suppliers",
        gradient: "from-[#0f1f0f] via-[#1a3a1a] to-[#0f2a1a]",
        accentColor: "#86efac",
        badge: "إدارة الموردين",
        sidebarTitle: "الموردين",
        mainIcon: Truck,
        title: "علاقات موردين منظّمة",
        subtitle: "من طلب الشراء حتى الاستلام — بدون ورق",
        description: "أدِر جميع موردِيك بكشوف حسابات مفصّلة، سجِّل فواتير الشراء، وتابع الرصيد المستحق. نظام أوامر الشراء الذكي يقترح الكميات المثلى بناءً على حركة المبيعات وحدود المخزون.",
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
    {
        id: "transfers",
        gradient: "from-[#002040] via-[#003060] to-[#001a3a]",
        accentColor: "#7dd3fc",
        badge: "تحويل المخزون",
        sidebarTitle: "تحويل المخزون",
        mainIcon: ArrowRightLeft,
        title: "توازن المخزون بين الفروع",
        subtitle: "فرع يفيض — وآخر ينقص؟ المشكلة محلولة",
        description: "حوِّل الأدوية بين فروعك بنقرات معدودة. نظام طلب ← إرسال ← استلام يضمن المساءلة الكاملة في كل خطوة — مع تحديث فوري للمخزون في كلا الفرعين.",
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
    {
        id: "stocktake",
        gradient: "from-[#1a1500] via-[#332900] to-[#1a1500]",
        accentColor: "#fbbf24",
        badge: "الجرد الدوري",
        sidebarTitle: "الجرد الدوري",
        mainIcon: ClipboardList,
        title: "جرد لحظي بلا أخطاء",
        subtitle: "قارن الواقع بالنظام — وصحِّح الفروقات فوراً",
        description: "نظام جرد رقمي كامل: امسح الأصناف، سجِّل الكميات الفعلية، وسيحسب النظام الفروقات تلقائياً. الخسائر تُسجَّل كمصروف، والفروقات تُصحَّح في المخزون مباشرة — مع تقرير مفصّل لكل جردة.",
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
    {
        id: "expenses",
        gradient: "from-[#2a0a0a] via-[#4a1515] to-[#2a0a0a]",
        accentColor: "#fca5a5",
        badge: "إدارة المصروفات",
        sidebarTitle: "المصروفات",
        mainIcon: Receipt,
        title: "كل مصروف في مكانه",
        subtitle: "راتب — إيجار — صيانة — كلها تحت السيطرة",
        description: "سجِّل جميع مصروفات الفرع بالتصنيفات والتواريخ والمبالغ. تُدرَج المصروفات تلقائياً في حسابات الأرباح والخسائر لتحصل على صورة مالية حقيقية 100٪ عن أداء صيدليتك.",
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
    {
        id: "reports",
        gradient: "from-[#0c1445] via-[#1a237e] to-[#0d1b52]",
        accentColor: "#60a5fa",
        badge: "تحليلات متقدمة",
        sidebarTitle: "التقارير",
        mainIcon: BarChart3,
        title: "تقارير تتحدث بالأرقام",
        subtitle: "قرارات مبنية على البيانات — لا على التخمين",
        description: "تقارير شاملة: مبيعات يومية/شهرية، أرباح صافية، أداء الموظفين، حركة المخزون، الأدوية الأكثر مبيعاً، مقارنة الفروع. تصدير PDF و Excel بضغطة واحدة.",
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
    {
        id: "ai-assistant",
        gradient: "from-[#0d0920] via-[#1e0f4e] to-[#0d0920]",
        accentColor: "#8b5cf6",
        badge: "ذكاء اصطناعي",
        sidebarTitle: "المساعد الذكي",
        mainIcon: Bot,
        title: "مساعدك الذكي في الصيدلية",
        subtitle: "اسأل بالعربية — واحصل على إجابة فورية من بياناتك",
        description: "مساعد مدعوم بـ Gemini / GPT يحلل بيانات صيدليتك ويجيب على أسئلتك بلغة طبيعية — مبيعات اليوم، أرباح الشهر، المخزون الناقص، الحركات المشبوهة. كل ذلك بنقرة واحدة.",
        features: [
            { icon: MessageSquare, text: "أسئلة بالعربية الحرة" },
            { icon: TrendingUp, text: "تحليل المبيعات والأرباح" },
            { icon: AlertTriangle, text: "كشف الحركات المشبوهة" },
            { icon: Brain, text: "Gemini · GPT مدعوم بـ" },
        ],
        stats: [
            { value: "فوري", label: "الرد" },
            { value: "7", label: "تصنيفات ذكية" },
            { value: "آمن", label: "100٪ مشفر" },
        ],
    },
    {
        id: "safe",
        gradient: "from-[#0a1a0a] via-[#0f2e0f] to-[#0a1f0a]",
        accentColor: "#34d399",
        badge: "إدارة الصندوق",
        sidebarTitle: "إدارة الصندوق",
        mainIcon: Wallet,
        title: "صندوق الفرع تحت المجهر",
        subtitle: "كل دينار يدخل — وكل دينار يخرج — موثَّق",
        description: "نظام صندوق نقدي متكامل: كل عملية بيع تُضاف تلقائياً، كل مصروف يُخصَم فوراً، وكل مرتجع يُعدَّل في الحال. سجِّل شيفتات الدوام وأقفل الصندوق في نهاية كل وردية.",
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
    {
        id: "desktop",
        gradient: "from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a]",
        accentColor: "#a5b4fc",
        badge: "تطبيق سطح المكتب",
        sidebarTitle: "تطبيق المكتب",
        mainIcon: Laptop,
        title: "يعمل حتى بدون إنترنت",
        subtitle: "انقطع الإنترنت؟ العمل لا يتوقف.",
        description: "تطبيق Electron متكامل للحاسوب يعمل بشكل كامل offline: بيع، جرد، إضافة دفعات. وعند عودة الإنترنت، تتم المزامنة التلقائية مع السحابة دون فقدان أي بيانات.",
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
    {
        id: "permissions",
        gradient: "from-[#1a0d00] via-[#2e1800] to-[#1a0d00]",
        accentColor: "#fdba74",
        badge: "صلاحيات محكمة",
        sidebarTitle: "الصلاحيات",
        mainIcon: Shield,
        title: "كل موظف بصلاحياته فقط",
        subtitle: "أدمن — مدير فرع — صيدلاني — كاشير",
        description: "نظام صلاحيات متعدد المستويات: 31 صلاحية مستقلة قابلة للتفعيل والتعطيل لكل موظف. لا يرى الكاشير الأرباح، ولا يملك الصيدلاني حق حذف الفواتير — إلا من تأذن له.",
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
    {
        id: "audit",
        gradient: "from-[#0a0a1e] via-[#15153a] to-[#0a0a1e]",
        accentColor: "#818cf8",
        badge: "سجل التدقيق",
        sidebarTitle: "سجل التدقيق",
        mainIcon: Eye,
        title: "لا شيء يحدث في الخفاء",
        subtitle: "كل فعل موثَّق — من فعله ومتى وأين",
        description: "سجل تدقيق شامل يُسجِّل كل عملية: من أضاف دواءً، من حذف فاتورة، من عدَّل سعراً، من غيَّر صلاحية. بحث وتصفية متقدمة بالتاريخ والمستخدم والفرع والنوع.",
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
    {
        id: "backup",
        gradient: "from-[#0f1a0f] via-[#1a2e1a] to-[#0f1a0f]",
        accentColor: "#86efac",
        badge: "أمان البيانات",
        sidebarTitle: "النسخ الاحتياطي",
        mainIcon: Database,
        title: "بياناتك محمية — دائماً",
        subtitle: "نسخ احتياطي — استعادة — تشفير",
        description: "نسخ احتياطي كامل لجميع بيانات المنظومة بضغطة واحدة. استعادة فورية من أي نسخة سابقة. التشفير من طرف إلى طرف يضمن أن بياناتك لا تصل إلى أحد غيرك.",
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
    {
        id: "loyalty",
        gradient: "from-[#1a0a2e] via-[#2d1050] to-[#1a0a2e]",
        accentColor: "#e879f9",
        badge: "نظام الولاء",
        sidebarTitle: "نظام الولاء",
        mainIcon: Star,
        title: "اكسب ولاء زبائنك",
        subtitle: "نقاط — مكافآت — عروض مخصصة",
        description: "نظام ولاء متكامل: يكسب الزبون نقاطاً مع كل عملية شراء، ويستبدلها بخصومات في مشترياته القادمة. عزِّز علاقتك بزبائنك وارفع نسبة العودة بشكل ملموس.",
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
    {
        id: "alerts",
        gradient: "from-[#1e0f00] via-[#3a1e00] to-[#1e0f00]",
        accentColor: "#fcd34d",
        badge: "التنبيهات الذكية",
        sidebarTitle: "التنبيهات",
        mainIcon: Bell,
        title: "كن دائماً على علم",
        subtitle: "النظام يراقب — وأنت تأخذ قرارات",
        description: "منظومة تنبيهات ذكية في الوقت الفعلي: أدوية قاربت على الانتهاء، مخزون وصل للحد الأدنى، ديون مستحقة، طلبات شراء معلّقة. لا تفوِّت أي تفصيل يؤثر على عملك.",
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
    {
        id: "cta",
        gradient: "from-[#0f0c29] via-[#302b63] to-[#24243e]",
        accentColor: "#818cf8",
        badge: null,
        sidebarTitle: "ابدأ الآن",
        mainIcon: Zap,
        title: "ابدأ رحلتك مع فاراماس",
        subtitle: "صيدليتك تستحق نظاماً بمستوى طموحاتك",
        description: "من الفرع الواحد إلى الشبكة الكاملة — فاراماس يكبر معك. أضف فروعك، سجِّل الأدوية، وابدأ البيع خلال دقائق. فريق الدعم معك في كل خطوة.",
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

    useEffect(() => {
        setMounted(true);
        if (!localStorage.getItem(ONBOARDING_KEY)) setIsOpen(true);
    }, []);

    const goToSlide = useCallback(
        (index: number, dir: "next" | "prev") => {
            if (animating) return;
            setAnimating(true);
            setDirection(dir);
            setTimeout(() => {
                setCurrentSlide(index);
                setAnimating(false);
            }, 300);
        },
        [animating]
    );

    const handleNext = () => {
        if (currentSlide < slides.length - 1) goToSlide(currentSlide + 1, "next");
        else handleClose();
    };

    const handlePrev = () => {
        if (currentSlide > 0) goToSlide(currentSlide - 1, "prev");
    };

    const handleClose = () => {
        setIsOpen(false);
        localStorage.setItem(ONBOARDING_KEY, "true");
    };

    if (!mounted || !isOpen) return null;

    const slide = slides[currentSlide];
    const MainIcon = slide.mainIcon;
    const isLastSlide = currentSlide === slides.length - 1;
    const isFirstSlide = currentSlide === 0;
    const progress = ((currentSlide + 1) / slides.length) * 100;
    const ac = slide.accentColor;

    return (
        <>
            <style jsx global>{`
                @keyframes onb-float {
                    0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.12; }
                    50%       { transform: translateY(-24px) rotate(180deg); opacity: 0.2; }
                }
                @keyframes onb-enter-next {
                    from { opacity: 0; transform: translateX(-32px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes onb-enter-prev {
                    from { opacity: 0; transform: translateX(32px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes onb-exit-next {
                    from { opacity: 1; transform: translateX(0); }
                    to   { opacity: 0; transform: translateX(32px); }
                }
                @keyframes onb-exit-prev {
                    from { opacity: 1; transform: translateX(0); }
                    to   { opacity: 0; transform: translateX(-32px); }
                }
                @keyframes onb-glow {
                    0%, 100% { opacity: 0.25; transform: scale(1); }
                    50%      { opacity: 0.45; transform: scale(1.15); }
                }
                @keyframes onb-icon-pop {
                    from { opacity: 0; transform: scale(0.7); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes onb-card-in {
                    from { opacity: 0; transform: translateY(16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .onb-anim-enter-next { animation: onb-enter-next 0.32s cubic-bezier(0.16,1,0.3,1) both; }
                .onb-anim-enter-prev { animation: onb-enter-prev 0.32s cubic-bezier(0.16,1,0.3,1) both; }
                .onb-anim-exit-next  { animation: onb-exit-next  0.22s cubic-bezier(0.7,0,0.84,0) both; }
                .onb-anim-exit-prev  { animation: onb-exit-prev  0.22s cubic-bezier(0.7,0,0.84,0) both; }
                .onb-icon-pop { animation: onb-icon-pop 0.4s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
                .onb-card-1 { animation: onb-card-in 0.35s cubic-bezier(0.16,1,0.3,1) 0.15s both; }
                .onb-card-2 { animation: onb-card-in 0.35s cubic-bezier(0.16,1,0.3,1) 0.22s both; }
                .onb-card-3 { animation: onb-card-in 0.35s cubic-bezier(0.16,1,0.3,1) 0.29s both; }
                .onb-card-4 { animation: onb-card-in 0.35s cubic-bezier(0.16,1,0.3,1) 0.36s both; }
                .onb-sidebar-item { transition: background 0.18s, opacity 0.18s; }
                .onb-sidebar-item:hover { background: rgba(255,255,255,0.07); }
            `}</style>

            <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" dir="rtl">

                {/* ─── Background ─────────────────────────────────────── */}
                <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} transition-all duration-700`}>
                    <div className="absolute top-[10%] right-[15%] w-72 h-72 rounded-full blur-3xl pointer-events-none"
                         style={{ background: ac, animation: "onb-float 10s ease-in-out infinite", opacity: 0.12 }} />
                    <div className="absolute bottom-[10%] left-[10%] w-96 h-96 rounded-full blur-3xl pointer-events-none"
                         style={{ background: ac, animation: "onb-float 14s ease-in-out infinite 3s", opacity: 0.08 }} />
                    <div className="absolute inset-0 pointer-events-none"
                         style={{
                             backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.022) 1px, transparent 0)",
                             backgroundSize: "36px 36px",
                         }} />
                </div>

                {/* ─── Top Bar ─────────────────────────────────────────── */}
                <header className="relative z-10 flex-shrink-0 flex items-center gap-3 px-5 h-14 border-b border-white/10"
                        style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(12px)" }}>
                    {/* Logo */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                             style={{ background: `${ac}25`, border: `1px solid ${ac}40` }}>
                            <Pill className="w-3.5 h-3.5" style={{ color: ac }} />
                        </div>
                        <span className="text-white font-black text-sm tracking-tight">فاراماس</span>
                    </div>

                    <div className="w-px h-5 bg-white/15 flex-shrink-0" />

                    {/* Current step name */}
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: ac }}>
                        {slide.sidebarTitle}
                    </span>

                    {/* Progress bar */}
                    <div className="flex-1 mx-3">
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500 ease-out"
                                 style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${ac}70, ${ac})` }} />
                        </div>
                    </div>

                    {/* Step counter */}
                    <span className="text-xs font-bold flex-shrink-0 opacity-50 text-white">
                        {currentSlide + 1} / {slides.length}
                    </span>

                    {/* Skip */}
                    <button onClick={handleClose}
                            className="flex-shrink-0 text-xs font-bold text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10">
                        تخطي الجولة ✕
                    </button>
                </header>

                {/* ─── Middle: sidebar + content ───────────────────────── */}
                <div className="relative z-10 flex flex-1 overflow-hidden">

                    {/* Sidebar (right in RTL) */}
                    <aside className="flex-shrink-0 w-60 xl:w-64 overflow-y-auto border-l border-white/10"
                           style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(10px)" }}>
                        <div className="p-3">
                            <p className="text-white/30 text-[10px] font-black uppercase tracking-widest px-2 mb-2">
                                خطوات الجولة
                            </p>
                            <div className="space-y-0.5">
                                {slides.map((s, i) => {
                                    const isActive = i === currentSlide;
                                    const isDone = i < currentSlide;
                                    const SIcon = s.mainIcon;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => goToSlide(i, i > currentSlide ? "next" : "prev")}
                                            className="onb-sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-right"
                                            style={{
                                                background: isActive ? `${ac}15` : "transparent",
                                                border: isActive ? `1px solid ${ac}30` : "1px solid transparent",
                                            }}
                                        >
                                            {/* Indicator */}
                                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                                                 style={{
                                                     background: isActive ? ac : isDone ? "#10b981" : "rgba(255,255,255,0.1)",
                                                     color: "white",
                                                 }}>
                                                {isDone
                                                    ? <Check className="w-2.5 h-2.5" />
                                                    : <span style={{ color: isActive ? "#000" : "rgba(255,255,255,0.6)" }}>{i + 1}</span>
                                                }
                                            </div>
                                            {/* Icon */}
                                            <SIcon className="w-3.5 h-3.5 flex-shrink-0"
                                                   style={{ color: isActive ? ac : isDone ? "#10b981" : "rgba(255,255,255,0.25)" }} />
                                            {/* Title */}
                                            <span className="text-xs font-bold truncate"
                                                  style={{ color: isActive ? "white" : isDone ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)" }}>
                                                {s.sidebarTitle}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>

                    {/* Main content */}
                    <main className="flex-1 overflow-y-auto flex items-center justify-center p-6 lg:p-10">
                        <div
                            key={currentSlide}
                            className={`max-w-xl w-full ${
                                animating
                                    ? direction === "next" ? "onb-anim-exit-next" : "onb-anim-exit-prev"
                                    : direction === "next" ? "onb-anim-enter-next" : "onb-anim-enter-prev"
                            }`}
                        >
                            {/* Main Icon */}
                            <div className="flex justify-center mb-5 onb-icon-pop">
                                <div className="relative">
                                    <div className="absolute inset-[-12px] rounded-3xl blur-2xl pointer-events-none"
                                         style={{ background: ac, animation: "onb-glow 3s ease-in-out infinite", opacity: 0.25 }} />
                                    <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
                                         style={{
                                             background: `linear-gradient(135deg, ${ac}30, ${ac}12)`,
                                             border: `1.5px solid ${ac}40`,
                                             boxShadow: `0 8px 32px ${ac}25`,
                                         }}>
                                        <MainIcon className="w-9 h-9" style={{ color: ac }} />
                                    </div>
                                </div>
                            </div>

                            {/* Badge */}
                            {slide.badge && (
                                <div className="flex justify-center mb-3">
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-black uppercase tracking-widest"
                                          style={{
                                              background: `${ac}18`,
                                              border: `1px solid ${ac}35`,
                                              color: ac,
                                          }}>
                                        <Sparkles className="w-2.5 h-2.5" />
                                        {slide.badge}
                                    </span>
                                </div>
                            )}

                            {/* Title */}
                            <h1 className={`font-black text-white text-center mb-2 leading-tight ${isFirstSlide ? "text-6xl md:text-7xl" : "text-3xl md:text-4xl"}`}
                                style={{ textShadow: `0 0 60px ${ac}45` }}>
                                {slide.title}
                            </h1>

                            {/* Subtitle */}
                            <p className="text-sm md:text-base font-bold text-center mb-4" style={{ color: ac }}>
                                {slide.subtitle}
                            </p>

                            {/* Description */}
                            <p className="text-white/55 text-sm leading-relaxed text-center max-w-md mx-auto mb-6">
                                {slide.description}
                            </p>

                            {/* Feature cards */}
                            {slide.features && (
                                <div className="grid grid-cols-2 gap-2.5 mb-5">
                                    {slide.features.map((f, i) => {
                                        const FIcon = f.icon;
                                        return (
                                            <div key={i}
                                                 className={`onb-card-${i + 1} flex items-center gap-3 p-3.5 rounded-xl`}
                                                 style={{
                                                     background: "rgba(255,255,255,0.05)",
                                                     border: "1px solid rgba(255,255,255,0.09)",
                                                 }}>
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                                     style={{ background: `${ac}20` }}>
                                                    <FIcon className="w-4 h-4" style={{ color: ac }} />
                                                </div>
                                                <span className="text-white/80 text-xs font-bold leading-snug">{f.text}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Stats */}
                            {slide.stats && (
                                <div className="flex justify-center gap-8 md:gap-14">
                                    {slide.stats.map((stat, i) => (
                                        <div key={i} className="text-center">
                                            <div className="text-xl md:text-2xl font-black mb-0.5" style={{ color: ac }}>
                                                {stat.value}
                                            </div>
                                            <div className="text-white/35 text-[10px] font-bold uppercase tracking-wider">
                                                {stat.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* CTA — last slide */}
                            {isLastSlide && (
                                <div className="flex flex-col items-center gap-3 mt-8">
                                    <button
                                        onClick={handleClose}
                                        className="px-10 py-3.5 rounded-xl text-base font-black text-black transition-all hover:scale-105 active:scale-95"
                                        style={{
                                            background: `linear-gradient(135deg, ${ac}, ${ac}cc)`,
                                            boxShadow: `0 0 30px ${ac}50`,
                                        }}
                                    >
                                        <span className="flex items-center gap-2">
                                            ابدأ استخدام فاراماس الآن
                                            <ArrowLeft className="w-4 h-4" />
                                        </span>
                                    </button>
                                    <p className="text-white/30 text-xs">
                                        يمكنك إعادة عرض هذه الجولة في أي وقت من الإعدادات
                                    </p>
                                </div>
                            )}
                        </div>
                    </main>
                </div>

                {/* ─── Bottom Bar ──────────────────────────────────────── */}
                <footer className="relative z-10 flex-shrink-0 flex items-center justify-between px-6 h-14 border-t border-white/10"
                        style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(12px)" }}>
                    {/* Prev */}
                    <button
                        onClick={handlePrev}
                        disabled={isFirstSlide}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white/50 hover:text-white disabled:opacity-0 transition-all hover:bg-white/10"
                    >
                        <ChevronRight className="w-4 h-4" />
                        السابق
                    </button>

                    {/* Dot navigation */}
                    <div className="flex items-center gap-1">
                        {slides.map((_, i) => {
                            const isActive = i === currentSlide;
                            const isNear = Math.abs(i - currentSlide) <= 2;
                            const isFar = Math.abs(i - currentSlide) > 4;
                            return (
                                <button
                                    key={i}
                                    onClick={() => goToSlide(i, i > currentSlide ? "next" : "prev")}
                                    className="rounded-full flex-shrink-0 transition-all duration-300"
                                    style={{
                                        width: isActive ? "24px" : isNear ? "6px" : "4px",
                                        height: isActive ? "6px" : "6px",
                                        background: isActive
                                            ? ac
                                            : i < currentSlide
                                            ? `${ac}55`
                                            : "rgba(255,255,255,0.18)",
                                        opacity: isFar ? 0.35 : 1,
                                    }}
                                />
                            );
                        })}
                    </div>

                    {/* Next */}
                    <button
                        onClick={handleNext}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
                        style={{
                            background: `${ac}22`,
                            border: `1px solid ${ac}45`,
                        }}
                    >
                        {isLastSlide ? "ابدأ الآن" : "التالي"}
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </footer>
            </div>
        </>
    );
}
