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
} from "lucide-react";

const ONBOARDING_KEY = "faramace_onboarding_completed";

const slides = [
    {
        id: "hero",
        gradient: "from-[#0f0c29] via-[#302b63] to-[#24243e]",
        accentColor: "#818cf8",
        badge: null,
        title: "فاراماس",
        subtitle: "مستقبل إدارة الصيدليات",
        description: "نظام سحابي متكامل يجمع بين القوة والبساطة لإدارة صيدليتك بذكاء واحترافية",
        features: [
            { icon: Cloud, text: "سحابي بالكامل" },
            { icon: Zap, text: "سريع وخفيف" },
            { icon: Lock, text: "آمن ومشفّر" },
            { icon: Globe, text: "يعمل من أي مكان" },
        ],
        stats: [
            { value: "99.9%", label: "وقت التشغيل" },
            { value: "∞", label: "فروع" },
            { value: "24/7", label: "الدعم" },
        ],
    },
    {
        id: "branches",
        gradient: "from-[#0f2027] via-[#203a43] to-[#2c5364]",
        accentColor: "#67e8f9",
        badge: "إدارة متعددة",
        title: "فروع بلا حدود",
        subtitle: "تحكّم كامل بكل فرع",
        description: "أدر جميع فروع صيدليتك من مكان واحد. لكل فرع مخزونه وأسعاره وفريق عمله المستقل — مع تقارير مركزية شاملة.",
        features: [
            { icon: Store, text: "فروع غير محدودة" },
            { icon: Users, text: "صلاحيات مخصصة" },
            { icon: BarChart3, text: "تقارير مركزية" },
            { icon: Shield, text: "عزل البيانات" },
        ],
        stats: [
            { value: "∞", label: "فروع" },
            { value: "100%", label: "عزل البيانات" },
            { value: "فوري", label: "المزامنة" },
        ],
    },
    {
        id: "drugs",
        gradient: "from-[#1a2a1a] via-[#0d3b0d] to-[#1a4a2e]",
        accentColor: "#4ade80",
        badge: "قاعدة بيانات ذكية",
        title: "قاعدة أدوية شاملة",
        subtitle: "سجّل مرة، استخدم في كل مكان",
        description: "قاعدة بيانات مركزية للأدوية بالباركود والأسماء التجارية والعلمية. أضف الدواء مرة واحدة وسيكون متاحاً لجميع فروعك تلقائياً.",
        features: [
            { icon: Pill, text: "باركود تلقائي" },
            { icon: Globe, text: "مشاركة بين الفروع" },
            { icon: Shield, text: "كشف التفاعلات الدوائية" },
            { icon: Zap, text: "بحث فوري" },
        ],
        stats: [
            { value: "DDI", label: "كشف التفاعلات" },
            { value: "فوري", label: "البحث" },
            { value: "QR", label: "مسح الباركود" },
        ],
    },
    {
        id: "inventory",
        gradient: "from-[#2d1b00] via-[#4a2c00] to-[#3d2200]",
        accentColor: "#fb923c",
        badge: "تتبع ذكي",
        title: "مخزون تحت السيطرة",
        subtitle: "لن تفقد حبة دواء واحدة",
        description: "تتبع كل دفعة وكمية وتاريخ انتهاء. تنبيهات ذكية قبل نفاد المخزون وقبل انتهاء الصلاحية. طلبات شراء تلقائية.",
        features: [
            { icon: Package, text: "تتبع الدفعات" },
            { icon: Bell, text: "تنبيهات ذكية" },
            { icon: TrendingUp, text: "تحليل الحركة" },
            { icon: ShoppingCart, text: "طلبات ذكية" },
        ],
        stats: [
            { value: "0%", label: "هدر الأدوية" },
            { value: "تلقائي", label: "إعادة الطلب" },
            { value: "دقيق", label: "تتبع الصلاحية" },
        ],
    },
    {
        id: "pos",
        gradient: "from-[#1a1a3e] via-[#2d1b69] to-[#1a0a3e]",
        accentColor: "#c084fc",
        badge: "نقطة البيع",
        title: "مبيعات بسرعة البرق",
        subtitle: "واجهة مصممة للسرعة",
        description: "نقطة بيع سريعة وسلسة مع دعم الباركود والدفع الإلكتروني. سجّل المبيعات وأصدر الفواتير في ثوانٍ معدودة.",
        features: [
            { icon: Zap, text: "بيع في ثوانٍ" },
            { icon: Smartphone, text: "دفع إلكتروني" },
            { icon: Users, text: "نظام الولاء" },
            { icon: Pill, text: "وصفات طبية" },
        ],
        stats: [
            { value: "< 3s", label: "زمن المعاملة" },
            { value: "Zain Cash", label: "دفع إلكتروني" },
            { value: "فوري", label: "تحديث المخزون" },
        ],
    },
    {
        id: "reports",
        gradient: "from-[#0c1445] via-[#1a237e] to-[#0d1b52]",
        accentColor: "#60a5fa",
        badge: "تحليلات متقدمة",
        title: "تقارير تتحدث",
        subtitle: "قرارات مبنية على البيانات",
        description: "تقارير شاملة ومفصلة لكل جانب من صيدليتك. تصدير PDF و Excel. رؤية واضحة للأداء المالي والتشغيلي.",
        features: [
            { icon: BarChart3, text: "تقارير مبيعات" },
            { icon: TrendingUp, text: "تحليل الأرباح" },
            { icon: Package, text: "تقارير المخزون" },
            { icon: Globe, text: "تصدير Excel/PDF" },
        ],
        stats: [
            { value: "PDF", label: "تصدير فوري" },
            { value: "Excel", label: "تقارير مفصلة" },
            { value: "يومي", label: "ملخص تلقائي" },
        ],
    },
    {
        id: "cta",
        gradient: "from-[#0f0c29] via-[#302b63] to-[#24243e]",
        accentColor: "#818cf8",
        badge: null,
        title: "ابدأ رحلتك الآن",
        subtitle: "صيدليتك تستحق الأفضل",
        description: "انضم لنظام فاراماس وابدأ بإدارة صيدليتك باحترافية. أضف فروعك، سجّل الأدوية، وابدأ البيع خلال دقائق.",
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

    const goToSlide = useCallback((index: number, dir: "next" | "prev") => {
        if (animating) return;
        setAnimating(true);
        setDirection(dir);
        setCountersVisible(false);
        setTimeout(() => {
            setCurrentSlide(index);
            setAnimating(false);
            setTimeout(() => setCountersVisible(true), 300);
        }, 400);
    }, [animating]);

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

    return (
        <>
            <style jsx global>{`
                @keyframes float-orb {
                    0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.15; }
                    33% { transform: translateY(-30px) rotate(120deg); opacity: 0.25; }
                    66% { transform: translateY(15px) rotate(240deg); opacity: 0.1; }
                }
                @keyframes pulse-ring {
                    0% { transform: scale(0.9); opacity: 0.5; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                    100% { transform: scale(0.9); opacity: 0.5; }
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
                    from { transform: scale(0.8); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                @keyframes glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(129,140,248,0.3); }
                    50% { box-shadow: 0 0 40px rgba(129,140,248,0.6); }
                }
                .onb-slide-enter { animation: slide-up 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
                .onb-slide-exit { animation: slide-down-out 0.4s cubic-bezier(0.7,0,0.84,0) forwards; }
                .onb-scale-in { animation: scale-in 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
                .onb-shimmer {
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
                    background-size: 200% 100%;
                    animation: shimmer 3s infinite;
                }
                .onb-stagger-1 { animation-delay: 0.1s; }
                .onb-stagger-2 { animation-delay: 0.2s; }
                .onb-stagger-3 { animation-delay: 0.3s; }
                .onb-stagger-4 { animation-delay: 0.4s; }
            `}</style>

            <div className="fixed inset-0 z-[9999] overflow-hidden" dir="rtl">
                {/* Animated Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} transition-all duration-700`}>
                    {/* Floating Orbs */}
                    <div className="absolute top-[10%] right-[15%] w-72 h-72 rounded-full blur-3xl" style={{ background: slide.accentColor, animation: "float-orb 8s ease-in-out infinite", opacity: 0.12 }} />
                    <div className="absolute bottom-[20%] left-[10%] w-96 h-96 rounded-full blur-3xl" style={{ background: slide.accentColor, animation: "float-orb 12s ease-in-out infinite 2s", opacity: 0.08 }} />
                    <div className="absolute top-[50%] left-[50%] w-64 h-64 rounded-full blur-3xl" style={{ background: slide.accentColor, animation: "float-orb 10s ease-in-out infinite 4s", opacity: 0.1 }} />

                    {/* Grid Pattern */}
                    <div className="absolute inset-0" style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)`,
                        backgroundSize: "40px 40px",
                    }} />
                </div>

                {/* Content */}
                <div className="relative h-full flex flex-col items-center justify-center p-6">
                    {/* Skip Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-6 left-6 text-white/40 hover:text-white/80 text-sm font-medium transition-all hover:bg-card/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10"
                    >
                        تخطي الجولة ✕
                    </button>

                    {/* Slide Counter */}
                    <div className="absolute top-6 right-6 text-white/40 text-sm font-mono">
                        {String(currentSlide + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
                    </div>

                    {/* Main Content */}
                    <div
                        key={currentSlide}
                        className={`max-w-4xl w-full text-center ${animating ? "onb-slide-exit" : "onb-slide-enter"}`}
                    >
                        {/* Badge */}
                        {slide.badge && (
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6 backdrop-blur-md border border-white/20" style={{ background: `${slide.accentColor}20`, color: slide.accentColor }}>
                                <Sparkles className="w-3.5 h-3.5" />
                                {slide.badge}
                            </div>
                        )}

                        {/* Title */}
                        {isFirstSlide ? (
                            <div className="mb-4">
                                <h1 className="text-7xl md:text-8xl font-black text-white tracking-tight mb-2" style={{ textShadow: `0 0 80px ${slide.accentColor}40` }}>
                                    {slide.title}
                                </h1>
                                <div className="h-1 w-24 mx-auto rounded-full mb-4" style={{ background: `linear-gradient(90deg, transparent, ${slide.accentColor}, transparent)` }} />
                                <p className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, white, ${slide.accentColor})` }}>
                                    {slide.subtitle}
                                </p>
                            </div>
                        ) : isLastSlide ? (
                            <div className="mb-4">
                                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight mb-3" style={{ textShadow: `0 0 80px ${slide.accentColor}40` }}>
                                    {slide.title}
                                </h1>
                                <p className="text-xl md:text-2xl font-bold" style={{ color: slide.accentColor }}>
                                    {slide.subtitle}
                                </p>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight mb-3" style={{ textShadow: `0 0 60px ${slide.accentColor}30` }}>
                                    {slide.title}
                                </h1>
                                <p className="text-xl md:text-2xl font-bold" style={{ color: slide.accentColor }}>
                                    {slide.subtitle}
                                </p>
                            </div>
                        )}

                        {/* Description */}
                        <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
                            {slide.description}
                        </p>

                        {/* Features Grid */}
                        {slide.features && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 max-w-3xl mx-auto">
                                {slide.features.map((feature: any, i: any) => {
                                    const FeatureIcon = feature.icon;
                                    return (
                                        <div
                                            key={i}
                                            className={`onb-scale-in onb-stagger-${i + 1} group relative p-5 rounded-2xl backdrop-blur-md border border-white/10 hover:border-white/25 transition-all duration-300 cursor-default hover:scale-105`}
                                            style={{ background: "rgba(255,255,255,0.05)" }}
                                        >
                                            <div className="absolute inset-0 rounded-2xl onb-shimmer" />
                                            <div className="relative">
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ background: `${slide.accentColor}20` }}>
                                                    <FeatureIcon className="w-6 h-6" style={{ color: slide.accentColor }} />
                                                </div>
                                                <p className="text-white/80 text-sm font-bold">{feature.text}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Stats */}
                        {slide.stats && (
                            <div className="flex justify-center gap-16 md:gap-28 mb-10">
                                {slide.stats.map((stat: any, i: any) => (
                                    <div key={i} className={`text-center transition-all duration-500 ${countersVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} style={{ transitionDelay: `${i * 150}ms` }}>
                                        <div className="text-3xl md:text-4xl font-black mb-3" style={{ color: slide.accentColor }}>
                                            {stat.value}
                                        </div>
                                        <div className="text-white/40 text-xs font-bold uppercase tracking-wider">{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* CTA for last slide */}
                        {isLastSlide && (
                            <div className="flex flex-col items-center gap-4 mt-4">
                                <button
                                    onClick={handleClose}
                                    className="group relative px-10 py-4 text-lg font-black text-white rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105"
                                    style={{ background: `linear-gradient(135deg, ${slide.accentColor}, ${slide.accentColor}cc)`, animation: "glow 2s infinite" }}
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        ابدأ استخدام فاراماس
                                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                                    </span>
                                </button>
                                <p className="text-white/30 text-sm">يمكنك إعادة عرض هذه الجولة من الإعدادات</p>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="absolute bottom-8 left-0 right-0 flex items-center justify-between px-8 max-w-4xl mx-auto">
                        {/* Prev Button */}
                        <button
                            onClick={handlePrev}
                            disabled={isFirstSlide}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white/50 hover:text-white disabled:opacity-0 disabled:cursor-default transition-all rounded-xl hover:bg-card/10 backdrop-blur-sm"
                        >
                            <ChevronRight className="w-4 h-4" />
                            السابق
                        </button>

                        {/* Dots */}
                        <div className="flex items-center gap-2">
                            {slides.map((_: any, i: any) => (
                                <button
                                    key={i}
                                    onClick={() => goToSlide(i, i > currentSlide ? "next" : "prev")}
                                    className="transition-all duration-300 rounded-full"
                                    style={{
                                        width: i === currentSlide ? "32px" : "8px",
                                        height: "8px",
                                        background: i === currentSlide ? slide.accentColor : i < currentSlide ? `${slide.accentColor}60` : "rgba(255,255,255,0.2)",
                                    }}
                                />
                            ))}
                        </div>

                        {/* Next Button */}
                        <button
                            onClick={handleNext}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition-all duration-300 hover:scale-105"
                            style={{ background: `${slide.accentColor}30`, border: `1px solid ${slide.accentColor}50` }}
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
