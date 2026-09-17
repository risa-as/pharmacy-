"use client";

// المرحلة 4 من ميزة المذاخر: طباعة الباركود/ملصقات الأسعار — عميل بحت.
// - jsbarcode مُثبَّتة أصلاً في package.json ("jsbarcode": "^3.12.3") — لا تبعية
//   جديدة (انظر types/jsbarcode.d.ts لتصريح الأنواع المحلي وسببه). لم يُكتب
//   مُرمِّز Code128 يدوي لأن المكتبة موجودة فعلاً (مواصفة هذه المرحلة: "If one
//   exists, use it").
// - استيراد ديناميكي (`await import("jsbarcode")`) داخل useEffect لا استيراد
//   ساكن في أعلى الملف: هذا مكوّن "use client" لكنه يُقيَّم أيضاً أثناء
//   التصيير على الخادم (SSR)/prerender قبل أن تعمل أي useEffect؛ الاستيراد
//   الديناميكي يضمن أن كود jsbarcode لا يُنفَّذ إطلاقاً إلا داخل المتصفح، بصرف
//   النظر عمّا قد يحدث لاحقاً داخل الحزمة نفسها عند التحديث — لا نعتمد على
//   فحص يدوي لمصدرها يبقى صحيحاً إلى الأبد.
// - عزل ورقة الطباعة عن صدفة التطبيق: القسم الأيسر (بحث/اختيار) بأكمله
//   print:hidden؛ ورقة الملصقات ذاتها تُبنى بشبكة CSS مُقاسة لورقة A4 شائعة
//   (ملصق ثابت ٥٨×٣٢مم، أعمدة auto-fill — انظر تعليق الشبكة أدناه للحساب
//   والسبب) مع break-inside-avoid لكل ملصق كي لا يُقطَع نصفين بين صفحتين.
//   تصريف قصّ الصدفة (الشريط الجانبي الثابت وoverflow-hidden على الحاوية)
//   الحتمي موجود في app/globals.css (@media print) لا هنا — انظر تعليقه
//   المطوَّل لسبب هذا الفصل.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Printer, Plus, Minus, Trash2, Tag } from "lucide-react";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";

interface CatalogItemLite {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string;
    price: number;
}

interface SelectedItem {
    item: CatalogItemLite;
    copies: number;
}

export default function LabelsClient({ initialItems }: { initialItems: CatalogItemLite[] }) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<SelectedItem[]>([]);
    const [showScientific, setShowScientific] = useState(true);

    const results = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return initialItems
            .filter(
                (i) =>
                    i.tradeName.toLowerCase().includes(q) ||
                    i.scientificName.toLowerCase().includes(q) ||
                    i.barcode.toLowerCase().includes(q)
            )
            .slice(0, 20);
    }, [search, initialItems]);

    const addItem = (item: CatalogItemLite) => {
        setSelected((prev) => {
            const existing = prev.find((s) => s.item.id === item.id);
            if (existing) {
                return prev.map((s) => (s.item.id === item.id ? { ...s, copies: s.copies + 1 } : s));
            }
            return [...prev, { item, copies: 1 }];
        });
        setSearch("");
    };

    const updateCopies = (id: string, delta: number) => {
        setSelected((prev) =>
            prev.map((s) => (s.item.id === id ? { ...s, copies: Math.max(1, s.copies + delta) } : s))
        );
    };

    const setCopies = (id: string, value: number) => {
        const copies = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
        setSelected((prev) => prev.map((s) => (s.item.id === id ? { ...s, copies } : s)));
    };

    const removeItem = (id: string) => {
        setSelected((prev) => prev.filter((s) => s.item.id !== id));
    };

    const totalLabels = selected.reduce((sum, s) => sum + s.copies, 0);

    // مسطَّحة: نسخة واحدة من كل صنف مكرَّرة بعدد copies — الشبكة تعرضها كلها
    // بالتتابع كملصقات منفصلة (لا تجميع بصري لنسخ الصنف الواحد).
    const labels = useMemo(
        () =>
            selected.flatMap((s) =>
                Array.from({ length: s.copies }, (_, i) => ({ ...s.item, _labelKey: `${s.item.id}-${i}` }))
            ),
        [selected]
    );

    return (
        <div className="space-y-6" dir="rtl">
            <div className="print:hidden">
                <PageHeader
                    title="طباعة الباركود والملصقات"
                    description="اختر الأصناف وعدد الملصقات لكل صنف، ثم اطبع الورقة كاملة من هذه الصفحة مباشرة."
                    actions={
                        <button
                            type="button"
                            onClick={() => window.print()}
                            disabled={totalLabels === 0}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Printer className="h-4 w-4" />
                            طباعة ({totalLabels})
                        </button>
                    }
                />
            </div>

            {/* لوحة البحث والاختيار — لا تُطبَع إطلاقاً */}
            <div className="print:hidden space-y-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                        بحث عن صنف من كتالوجك لإضافته
                    </label>
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="اكتب الاسم التجاري أو العلمي أو الباركود..."
                            className="w-full rounded-lg border bg-muted py-3 pl-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>

                    {results.length > 0 && (
                        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border bg-card shadow-md">
                            {results.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => addItem(item)}
                                    className="flex w-full items-center justify-between border-b px-4 py-3 text-right transition-colors last:border-b-0 hover:bg-primary/10"
                                >
                                    <div>
                                        <div className="font-medium text-foreground">{item.tradeName}</div>
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {item.barcode || "بلا باركود"} · {item.price.toLocaleString("ar-IQ")} د.ع
                                        </div>
                                    </div>
                                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {selected.length > 0 && (
                    <div className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h2 className="font-semibold text-foreground">
                                الأصناف المحددة ({selected.length} صنف · {totalLabels.toLocaleString("ar-IQ")} ملصق)
                            </h2>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={showScientific}
                                    onChange={(e) => setShowScientific(e.target.checked)}
                                    className="h-4 w-4 rounded border"
                                />
                                إظهار الاسم العلمي على الملصق
                            </label>
                        </div>

                        <div className="space-y-2">
                            {selected.map((s) => (
                                <div
                                    key={s.item.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-foreground">{s.item.tradeName}</div>
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {s.item.barcode || "بلا باركود"} · {s.item.price.toLocaleString("ar-IQ")} د.ع
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updateCopies(s.item.id, -1)}
                                            className="rounded bg-card p-1 hover:bg-border"
                                            aria-label="إنقاص عدد الملصقات"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <input
                                            type="number"
                                            min={1}
                                            value={s.copies}
                                            onChange={(e) => setCopies(s.item.id, Number(e.target.value))}
                                            className="w-14 rounded border bg-card px-1 py-1 text-center text-sm tabular-nums"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateCopies(s.item.id, 1)}
                                            className="rounded bg-card p-1 hover:bg-border"
                                            aria-label="زيادة عدد الملصقات"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeItem(s.item.id)}
                                            className="mr-2 rounded bg-destructive/10 p-1 text-destructive hover:bg-destructive/20"
                                            aria-label="إزالة الصنف"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selected.length === 0 && (
                    <EmptyState
                        icon={<Tag className="h-8 w-8" />}
                        title="ابحث عن أصناف أعلاه وأضفها لطباعة ملصقاتها."
                        description="يمكنك تحديد عدد نسخ الملصق لكل صنف قبل الطباعة."
                    />
                )}
            </div>

            {/* ورقة الطباعة — تظهر كمعاينة على الشاشة وتبقى الوحيدة الظاهرة عند
                الطباعة فعلياً (كل ما سبق أعلاه print:hidden). */}
            {labels.length > 0 && (
                <div className="rounded-lg border bg-card p-4 shadow-sm print:m-0 print:rounded-none print:border-none print:p-0 print:shadow-none">
                    <p className="mb-3 text-xs text-muted-foreground print:hidden">معاينة ورقة الملصقات:</p>
                    {/* auto-fill بعرض ملصق ثابت (58مم) بدل عمود ثابت (3): عرض A4
                        الصافي القابل للطباعة يتفاوت فعلياً بهامش المتصفح/الطابعة
                        المختار (Chrome الافتراضي ~10مم لكل جهة ≈ 190مم صافي، لكن
                        هامش "عادي" في متصفحات/طابعات أخرى قد يبلغ 25.4مم لكل جهة
                        ≈ 159مم صافي فقط) — بلا @page مفروضة هنا عمداً (كانت
                        ستُغيّر سلوك طباعة كل صفحات التطبيق الأخرى، لا هذه الصفحة
                        وحدها). ٣ أعمدة × ٥٨مم + فجوتان (gap-2 = 8px ≈ 2.1مم) ≈
                        ١٧٨مم تصلح ضمن الهامش الافتراضي الشائع؛ auto-fill يضمن
                        أنه إن ضاق الهامش الفعلي عن ذلك فالشبكة تعرض عمودين بدل
                        قصّ عمود ثالث خارج حافة الورقة بصمت. */}
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, 58mm)" }}>
                        {labels.map((label) => (
                            <Label
                                key={label._labelKey}
                                tradeName={label.tradeName}
                                scientificName={showScientific ? label.scientificName : null}
                                barcode={label.barcode}
                                price={label.price}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function Label({
    tradeName,
    scientificName,
    barcode,
    price,
}: {
    tradeName: string;
    scientificName: string | null;
    barcode: string;
    price: number;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed p-2 text-center print:break-inside-avoid print:rounded-none print:border-solid print:border-black"
            style={{ width: "58mm", height: "32mm" }}
        >
            <p className="w-full truncate text-[11px] font-bold leading-tight text-foreground print:text-black">
                {tradeName}
            </p>
            {scientificName && (
                <p className="w-full truncate text-[9px] leading-tight text-muted-foreground print:text-black">
                    {scientificName}
                </p>
            )}
            <BarcodeSvg value={barcode} />
            <p className="font-mono text-[9px] tracking-wide text-muted-foreground print:text-black">
                {barcode || "بلا باركود"}
            </p>
            <p className="text-[12px] font-bold text-foreground print:text-black">
                {price.toLocaleString("ar-IQ")} د.ع
            </p>
        </div>
    );
}

/**
 * ترسم باركود CODE128 عبر jsbarcode (مثبَّتة أصلاً — انظر تعليق أعلى الملف).
 * displayValue=false عمداً: الرقم يُعرَض بسطر <p> منفصل تحت الشكل (نفس نمط
 * app/dashboard/inventory/barcode-print/page.tsx القائم) لضبط حجمه وخطّه
 * باستقلال عن حجم الباركود نفسه. valid() يُستدعى بدل رمي استثناء لنص غير
 * صالح — تُعرَض رسالة بديلة عوضاً عن شكل مكسور يبدو صحيحاً لكنه لا يُقرأ فعلياً
 * (تحذير المواصفة صراحة: باركود يبدو سليماً لكنه يفشل عند المسح أسوأ من غيابه).
 */
function BarcodeSvg({ value }: { value: string }) {
    const ref = useRef<SVGSVGElement | null>(null);
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        if (!value) return;
        let cancelled = false;
        setInvalid(false);

        import("jsbarcode")
            .then(({ default: JsBarcode }) => {
                if (cancelled || !ref.current) return;
                try {
                    JsBarcode(ref.current, value, {
                        format: "CODE128",
                        displayValue: false,
                        // margin=14 مع width=1.4: منطقة صامتة (quiet zone) ≈ 10×
                        // عرض أضيق شريط على كل جانب — الحد الأدنى الموصى به لـ
                        // Code128 كي يميّز الماسح حواف الترميز الفعلية عن حافة
                        // الملصق. className="w-full" على الـ<svg> يُكبِّر الشكل
                        // كاملاً (بما فيه هذه المنطقة) بنفس النسبة لاحقاً، فتبقى
                        // النسبة الآمنة محفوظة أياً كان حجم الملصق المطبوع فعلياً.
                        margin: 14,
                        height: 34,
                        width: 1.4,
                        valid: (ok) => {
                            if (!cancelled) setInvalid(!ok);
                        },
                    });
                } catch {
                    if (!cancelled) setInvalid(true);
                }
            })
            .catch(() => {
                if (!cancelled) setInvalid(true);
            });

        return () => {
            cancelled = true;
        };
    }, [value]);

    if (!value) {
        return (
            <div className="flex h-9 w-full items-center justify-center text-[9px] text-muted-foreground">
                بلا باركود
            </div>
        );
    }

    return (
        <div className="w-full">
            <svg ref={ref} className="w-full" style={{ height: 34, display: invalid ? "none" : "block" }} />
            {invalid && (
                <p className="text-[9px] text-destructive">باركود غير صالح للطباعة</p>
            )}
        </div>
    );
}
