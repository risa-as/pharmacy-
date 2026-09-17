// عنصر مشترك: حالة "لا توجد بيانات" موحّدة — رمز/أيقونة + سطر شرح واحد +
// إجراء رئيسي اختياري (مثال: «+ إضافة صنف» في كتالوج فارغ). يستبدل الفقرات
// النصية المجرَّدة المتفرقة سابقاً في كل عميل (Catalog/Stock/Orders/Returns/
// Accounts/Customers/Users) بنمط بصري واحد.
import type { ReactNode } from "react";

export default function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    /** رمز/إيموجي أو أيقونة — عرض فقط، لا معنى وظيفياً. */
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
            {icon && <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center text-3xl text-muted-foreground">{icon}</div>}
            <p className="font-medium text-foreground">{title}</p>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}
