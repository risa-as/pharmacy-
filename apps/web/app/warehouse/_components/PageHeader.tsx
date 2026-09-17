// عنصر مشترك: رأس صفحة موحّد لكل صفحات بوابة المذاخر — عنوان + وصف اختياري +
// فتحة إجراءات اختيارية (زر/بحث/فلتر...). الهدف حصراً توحيد المسافات ومكان
// الإجراءات بين الصفحات، بلا أي منطق — كل صفحة تبقى تقرر محتوى actions بنفسها.
import type { ReactNode } from "react";

export default function PageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-bold text-foreground">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
