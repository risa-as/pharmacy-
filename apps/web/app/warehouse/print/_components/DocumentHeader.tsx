// ترويسة مشتركة لكل مستند مطبوع: هوية المذخر + نوع المستند + رقمه وتاريخه.
// مكوّن خادم (بلا 'use client') — بيانات محضة بلا تفاعل.

export default function DocumentHeader({
    warehouseName,
    warehouseCity,
    warehousePhone,
    documentType,
    documentNumber,
    lines,
}: {
    warehouseName: string;
    warehouseCity?: string | null;
    warehousePhone?: string | null;
    documentType: string;
    documentNumber?: string | null;
    /** أسطر «التسمية: القيمة» على يسار الترويسة (تواريخ، عميل، حالة…). */
    lines: Array<{ label: string; value: string }>;
}) {
    return (
        <div className="mb-5 border-b border-border pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-foreground">{warehouseName}</h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {[warehouseCity, warehousePhone].filter(Boolean).join(' · ') || 'مذخر أدوية'}
                    </p>
                </div>
                <div className="text-left">
                    <p className="text-sm font-bold text-foreground">{documentType}</p>
                    {documentNumber && (
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
                            {documentNumber}
                        </p>
                    )}
                </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                {lines.map((l) => (
                    <div key={l.label} className="flex gap-1.5">
                        <dt className="shrink-0 text-muted-foreground">{l.label}:</dt>
                        <dd className="min-w-0 break-all font-medium text-foreground">{l.value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
