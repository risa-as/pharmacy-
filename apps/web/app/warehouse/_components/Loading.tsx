// عنصر مشترك: مؤشر تحميل موحّد (نص + دوّارة صغيرة) — يستبدل فقرات "جارٍ
// التحميل…" النصية المجرَّدة داخل النوافذ المنبثقة وتبويبات التقارير.
export default function LoadingBlock({ label = "جارٍ التحميل…" }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {label}
        </div>
    );
}
