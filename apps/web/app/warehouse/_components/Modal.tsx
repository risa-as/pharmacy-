"use client";

// عنصر مشترك: غلاف نافذة منبثقة (overlay + لوحة) لكل نوافذ بوابة المذاخر.
// يُصيَّر عبر createPortal إلى document.body بدل التداخل في شجرة JSX الحالية —
// هذا يتجنّب أي كسر صامت لـ `position: fixed` قد يسبّبه سلف بعيد (transform/
// filter/backdrop-filter/perspective/will-change/contain...) دون الحاجة لتتبّع
// أيّ سلف تحديداً. راجع: تقرير خلل "الشريط العلوي غير مغطّى" في /warehouse/customers.
//
// z-50 موحَّد لكل النوافذ (أعلى من درج التنقّل الجوّال في WarehouseSideNav
// الذي يبقى z-40 — لا تغييره، فهو ليس نافذة منبثقة).
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function Modal({
    open,
    onClose,
    title,
    children,
    maxWidthClass = "max-w-md",
}: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    maxWidthClass?: string;
}) {
    // آمن للتصيير على الخادم: document غير موجود أثناء SSR، لذا لا نستدعي
    // createPortal إلا بعد التركيب على المتصفّح (mounted === true).
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);

        // قفل تمرير الصفحة خلف النافذة — نحفظ القيمة السابقة ونعيدها كما كانت
        // بالضبط عند الإغلاق (وليس تصفيرها إلى '' دائماً، فقد تكون مضبوطة
        // مسبقاً من عنصر آخر).
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    if (!open || !mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => {
                // إغلاق عند النقر على الخلفية فقط، وليس داخل اللوحة — التحقق
                // من أنّ الهدف هو نفس عنصر الخلفية (currentTarget) لا عنصراً
                // فرعياً منها.
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* غلاف حجم شفاف فقط (بلا حدود/خلفية/حشو خاص به) — لوحة كل نافذة
                تحتفظ بكامل تنسيقها الأصلي (rounded-lg/border/bg-card/shadow/
                padding/max-h/overflow) كما كانت قبل التحويل إلى Modal. */}
            <div className={`w-full ${maxWidthClass}`}>{children}</div>
        </div>,
        document.body
    );
}
