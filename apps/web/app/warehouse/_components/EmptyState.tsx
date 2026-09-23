// عنصر مشترك: حالة "لا توجد بيانات" موحّدة — رمز/أيقونة + سطر شرح واحد +
// إجراء رئيسي اختياري (مثال: «+ إضافة صنف» في كتالوج فارغ). يستبدل الفقرات
// النصية المجرَّدة المتفرقة سابقاً في كل عميل (Catalog/Stock/Orders/Returns/
// Accounts/Customers/Users) بنمط بصري واحد.
import type { ReactNode } from "react";
import { Inbox, Package, Receipt, RotateCcw, UsersRound, FileSearch } from 'lucide-react';

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
    const icons: Record<string, typeof Inbox> = { '📦': Package, '🗃️': Package, '🧾': Receipt, '↩️': RotateCcw, '👥': UsersRound, '📭': Inbox };
    const Icon = typeof icon === 'string' ? icons[icon] ?? FileSearch : Inbox;
    return (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border bg-card px-6 py-8 text-center shadow-sm">
            <div aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border bg-muted/40 text-primary">{icon && typeof icon !== 'string' ? icon : <Icon className="h-6 w-6" strokeWidth={1.5} />}</div>
            <p className="font-medium text-foreground">{title}</p>
            {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}
