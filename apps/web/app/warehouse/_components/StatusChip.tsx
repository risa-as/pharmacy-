// عنصر مشترك: شارة حالة دلالية موحّدة لبوابة المذاخر — تستبدل كل خرائط
// STATUS_STYLES/AGING_STYLES المكرَّرة عبر العملاء المختلفين (حسابات، عملاء،
// طلبات، إرجاعات، مخزون، تقارير). خمس دلالات فقط (نجاح/تحذير/خطر/معلومة/
// محايد)، كلها ألوان "مخفَّفة" (bg-X/10 + text-X) لا "مصمتة" — نفس النمط
// المستخدَم أصلاً في StockClient/AccountsClient/CustomersClient، وتبقى مقروءة
// في الوضعين الفاتح والداكن دون الاعتماد على متغيرات X-foreground (المعرَّفة
// كأبيض ثابت في globals.css، والتي قد تُضعِف التباين فوق ألوان تتفتح في
// الوضع الداكن — انظر success/info في globals.css). منفصلة تماماً عن لون
// العلامة (primary) كما يشترط تصميم هذه المرحلة.
export type StatusChipVariant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANT_CLASSES: Record<StatusChipVariant, string> = {
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
    neutral: "bg-muted text-muted-foreground",
};

const VARIANT_BORDER_CLASSES: Record<StatusChipVariant, string> = {
    success: "border border-success/20",
    warning: "border border-warning/20",
    danger: "border border-destructive/20",
    info: "border border-info/20",
    neutral: "border border-border",
};

export default function StatusChip({
    label,
    variant,
    /** تمييز إضافي لحالة أكثر إلحاحاً ضمن نفس الدلالة (مثال: "حرج" ضمن تحذير، أو "+90 يوم" ضمن خطر) — لون واحد، وزن أثقل فقط. */
    emphasis = false,
    /** حدّ رفيع بلون الدلالة — يُستخدَم في شارات "الحالة" المستقلة (فعال/موقوف، نشط/محظور) حيث الحد يفصلها بصرية عن باقي النص. */
    bordered = false,
    className = "",
}: {
    label: string;
    variant: StatusChipVariant;
    emphasis?: boolean;
    bordered?: boolean;
    className?: string;
}) {
    return (
        <span
            className={[
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs",
                VARIANT_CLASSES[variant],
                emphasis ? "font-semibold" : "font-medium",
                bordered ? VARIANT_BORDER_CLASSES[variant] : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {label}
        </span>
    );
}
