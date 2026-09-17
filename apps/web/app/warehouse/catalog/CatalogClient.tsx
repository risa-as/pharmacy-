"use client";

// المرحلة 3 من ميزة المذاخر: عميل كتالوج المذخر — بحث، إضافة فردية بالباركود،
// تعديل السعر/التوفر، حذف، واستيراد Excel بتقرير مطابقة كامل.
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadWorkbook, readFirstSheetRows } from "@/app/lib/exceljs-browser";
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import StatusChip from "@/app/warehouse/_components/StatusChip";
import LoadingBlock from "@/app/warehouse/_components/Loading";
import Modal from "@/app/warehouse/_components/Modal";

interface CatalogItem {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string | null;
    // بلد المنشأ — من GlobalDrug.origin، يُعرَض فقط (لا تعديل من هذه الصفحة).
    origin: string | null;
    price: number;
    isAvailable: boolean;
    // سدّ فجوة هيكلية: costPrice/minStock كانا يُخزَّنان دائماً كصفر لغياب أي
    // حقل إدخال لهما — costPrice: null/0/سالب تعني "تكلفة غير معروفة" (انظر
    // catalogMarginPercent في warehouse-pricing.ts)، وmarginPercent المحسوب
    // خادمياً بنفس تلك الدالة (لا حساب JSX مستقل هنا). minStock صفر يعني "بلا
    // تنبيه نقص مخزون" (isLowStock في warehouse-stock.ts)، محسوب خادمياً أيضاً.
    costPrice: number;
    minStock: number;
    marginPercent: number | null;
    isLowStock: boolean;
    // ميزة البونص: قاعدة بونص قياسية اختيارية («اشترِ bonusThreshold خذ
    // bonusQuantity مجاناً») — 0 في أي منهما يعني "لا قاعدة بونص". تقترح فقط
    // قيمة أولية عند تسعير طلب (computeBonusUnits في app/lib/warehouse-bonus.ts)؛
    // القيمة المعتمدة فعلياً لكل طلب تبقى حقلاً منفصلاً يفاوضه المذخر حالة بحالة.
    bonusThreshold: number;
    bonusQuantity: number;
    // المرحلة ب من ميزة تتبّع المخزون: sellableQuantity محسوبة عبر summarizeStock
    // (تستثني المنتهي)، وavailability عبر deriveAvailability (isAvailable &&
    // sellableQuantity > 0) — إصلاح خطأ "متوفر أثناء نفاد المخزون". isAvailable
    // يبقى بمعناه الأصلي: مفتاح العرض اليدوي («معروض للبيع»)، لا التوفر الفعلي.
    sellableQuantity: number;
    availability: boolean;
}

interface ImportReport {
    imported: number;
    updated: number;
    failed: number;
    errors: Array<{ row: number; barcode?: string; message: string }>;
}

// إعادة التحميل الخفيف بعد إضافة/استيراد تجلب من /stock لا /catalog: نفس بيانات
// الكتالوج زائداً sellableQuantity/availability المحسوبتين، فلا يحتاج المكوّن
// حساباً مستقلاً أو استيراد warehouse-stock.ts (يبقى عميلاً بلا منطق مكرَّر).
async function fetchStockItems(): Promise<CatalogItem[] | null> {
    const res = await fetch("/api/warehouse-portal/stock");
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.items)) return null;
    return data.items.map((x: any) => ({
        id: x.id,
        barcode: x.barcode,
        tradeName: x.tradeName ?? x.barcode,
        scientificName: x.scientificName ?? null,
        origin: x.origin ?? null,
        price: x.price,
        costPrice: x.costPrice ?? 0,
        minStock: x.minStock ?? 0,
        bonusThreshold: x.bonusThreshold ?? 0,
        bonusQuantity: x.bonusQuantity ?? 0,
        marginPercent: x.marginPercent ?? null,
        isLowStock: x.isLowStock ?? false,
        isAvailable: x.isAvailable,
        sellableQuantity: x.sellableQuantity ?? 0,
        availability: x.availability ?? false,
    }));
}

export default function CatalogClient({
    initialItems,
    canEditPricing = false,
    canViewFinance = false,
}: {
    initialItems: CatalogItem[];
    /** المرحلة 5 (الصقل التجاري): أسعار الشرائح والتعديل الجماعي — واجهة فقط، الخادم يتحقق مجدداً. */
    canEditPricing?: boolean;
    /** كلفة الشراء وهامش الربح معلومتان مالية — تُعرَضان فقط لمن يملك canViewFinance (محسوبة خادمياً في page.tsx). واجهة فقط، الخادم يتحقق مجدداً. */
    canViewFinance?: boolean;
}) {
    const [items, setItems] = useState<CatalogItem[]>(initialItems);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ barcode: "", price: "", costPrice: "", minStock: "", tradeName: "", scientificName: "" });
    // ميزة نطاق المذخر: يصير true حين يرد الخادم بـ NEEDS_NAME — أي الباركود غير
    // مسجل في الكتالوج العالمي. حينها تظهر حقول الاسم ويُعاد الإرسال فيُنشأ الصنف
    // تحت نطاق هذا المذخر بانتظار ترقيته من إدارة المنصة.
    const [needsName, setNeedsName] = useState(false);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [report, setReport] = useState<ImportReport | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [tierPricesFor, setTierPricesFor] = useState<CatalogItem | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showBulk, setShowBulk] = useState(false);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (i) =>
                i.tradeName.toLowerCase().includes(q) ||
                i.barcode.toLowerCase().includes(q)
        );
    }, [items, search]);

    const addItem = async () => {
        const price = Number(form.price);
        if (!form.barcode.trim() || !Number.isFinite(price) || price <= 0) {
            toast.error("أدخل باركوداً وسعراً صحيحاً");
            return;
        }
        // كلفة الشراء وحد إعادة الطلب اختياريان — حقل فارغ لا يُرسَل إطلاقاً
        // (بدل إرساله كصفر)، فيتصرّف الخادم كما لو لم يُذكَر الحقل أصلاً.
        const body: {
            barcode: string;
            price: number;
            costPrice?: number;
            minStock?: number;
            tradeName?: string;
            scientificName?: string;
        } = {
            barcode: form.barcode.trim(),
            price,
        };
        // الاسم يُرسَل فقط حين طلبه الخادم — الخادم يهمله لباركود مسجل أصلاً، لكن
        // عدم إرساله ابتداءً يجعل النية واضحة في الشبكة.
        if (form.tradeName.trim() !== "") body.tradeName = form.tradeName.trim();
        if (form.scientificName.trim() !== "") body.scientificName = form.scientificName.trim();
        if (form.costPrice.trim() !== "") {
            const costPrice = Number(form.costPrice);
            if (!Number.isFinite(costPrice) || costPrice < 0) {
                toast.error("كلفة الشراء يجب أن تكون رقماً غير سالب");
                return;
            }
            body.costPrice = costPrice;
        }
        if (form.minStock.trim() !== "") {
            const minStock = Number(form.minStock);
            if (!Number.isFinite(minStock) || !Number.isInteger(minStock) || minStock < 0) {
                toast.error("حد إعادة الطلب يجب أن يكون عدداً صحيحاً غير سالب");
                return;
            }
            body.minStock = minStock;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/warehouse-portal/catalog", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.reason === "NEEDS_NAME") {
                    setNeedsName(true);
                    toast.error(data.error ?? "أدخل الاسم التجاري لهذا الباركود");
                    return;
                }
                toast.error(data.error ?? "فشل في إضافة الصنف");
                return;
            }
            const it = data.item;
            setItems((prev) => [
                ...prev.filter((p) => p.id !== it.id),
                {
                    id: it.id,
                    barcode: it.barcode,
                    tradeName: it.drug?.tradeName ?? it.barcode,
                    scientificName: it.drug?.scientificName ?? null,
                    origin: it.drug?.origin ?? null,
                    price: it.price,
                    costPrice: it.costPrice ?? 0,
                    minStock: it.minStock ?? 0,
                    bonusThreshold: it.bonusThreshold ?? 0,
                    bonusQuantity: it.bonusQuantity ?? 0,
                    marginPercent: null,
                    isLowStock: false,
                    isAvailable: it.isAvailable,
                    // صنف جديد لا دفعات له بعد — سيُستبدل فوراً بالتحميل الخفيف أدناه.
                    sellableQuantity: 0,
                    availability: false,
                },
            ]);
            // جلب الاسم العلمي والرصيد كاملَين — أعد التحميل الخفيف للتبسيط
            const fresh = await fetchStockItems();
            if (fresh) setItems(fresh);
            setForm({ barcode: "", price: "", costPrice: "", minStock: "", tradeName: "", scientificName: "" });
            setNeedsName(false);
            setShowForm(false);
            toast.success(
                data.scope === "WAREHOUSE"
                    ? "أُضيف الصنف تحت بند مذخرك — سيظهر لإدارة المنصة لترقيته إلى الكتالوج العالمي"
                    : "أُضيف الصنف للكتالوج",
            );
        } finally {
            setSaving(false);
        }
    };

    const updateItem = async (
        id: string,
        patch: {
            price?: number;
            isAvailable?: boolean;
            costPrice?: number;
            minStock?: number;
            bonusThreshold?: number;
            bonusQuantity?: number;
        }
    ): Promise<boolean> => {
        const res = await fetch("/api/warehouse-portal/catalog", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...patch }),
        });
        const data = await res.json();
        if (!res.ok) {
            toast.error(data.error ?? "فشل في التعديل");
            return false;
        }
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
        toast.success("تم التعديل");
        return true;
    };

    // تعديل السعر أو كلفة الشراء أو حد إعادة الطلب يؤثر على حقول مشتقة خادمياً
    // بحتة (marginPercent وisLowStock — انظر catalogMarginPercent/isLowStock في
    // warehouse-pricing.ts وwarehouse-stock.ts)، لا تُعاد حسابها هنا لتفادي
    // تكرار منطق العمل في العميل (نفس فلسفة تعليق رأس هذا الملف). مثال ملموس:
    // صنف سعره 1000 وكلفته 600 (هامش 40%) — رفع السعر إلى 2000 عبر PriceCell
    // فقط (بلا هذا الاستدعاء) كان سيُبقي الهامش المعروض 40% رغم أنه أصبح 70%
    // فعلياً. إعادة تحميل خفيفة عبر /stock بعد نجاح PATCH تكفي لتحديث كل
    // الحقول المشتقة معاً — لكن فقط حين ينجح PATCH فعلاً: فاعل يملك canViewFinance
    // بلا canEditPricing/canViewStock (مثل ACCOUNTANT) يجب ألا يُطلَق طلب /stock
    // إضافياً بعد 403 مؤكَّد على PATCH نفسه.
    const updateFinanceItem = async (
        id: string,
        patch: { price?: number; costPrice?: number; minStock?: number; bonusThreshold?: number; bonusQuantity?: number }
    ) => {
        const ok = await updateItem(id, patch);
        if (!ok) return;
        const fresh = await fetchStockItems();
        if (fresh) setItems(fresh);
    };

    const deleteItem = async (id: string) => {
        const res = await fetch(`/api/warehouse-portal/catalog?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
        });
        if (!res.ok) {
            const d = await res.json();
            toast.error(d.error ?? "فشل في الحذف");
            return;
        }
        setItems((prev) => prev.filter((p) => p.id !== id));
        toast.success("حُذف الصنف من الكتالوج");
    };

    const downloadTemplate = async () => {
        const rows = [
            ["الباركود", "السعر (د.ع)", "متوفر (نعم/لا)", "كلفة الشراء (اختياري)", "حد إعادة الطلب (اختياري)"],
            ["5012345678900", "1250", "نعم", "900", "20"],
            ["5012345678901", "900", "نعم", "", ""],
        ];
        await downloadWorkbook("قالب-كتالوج-المذخر.xlsx", [{ name: "الكتالوج", rows }]);
    };

    const handleFile = async (file: File) => {
        setImporting(true);
        setReport(null);
        try {
            const raw = await readFirstSheetRows(await file.arrayBuffer());
            if (!raw.length) {
                toast.error("الملف فارغ");
                return;
            }
            const header = (raw[0] as any[]).map((h) => String(h ?? "").trim());
            const bIdx = header.findIndex((h) => h.includes("باركود"));
            const pIdx = header.findIndex((h) => h.includes("سعر"));
            const aIdx = header.findIndex((h) => h.includes("متوفر"));
            // عمودان اختياريان جديدان — بلا اختراع قاعدة مطابقة جديدة: قوائم
            // البدائل هنا هي نفسها المعتمدة فعلياً في COLUMN_KEYS
            // (app/dashboard/inventory/import/page.tsx: cost/minStock)، زائداً
            // مصطلحَي هذه الصفحة نفسها ("كلفة الشراء"/"حد إعادة الطلب"). المطابقة
            // بالاحتواء بعد خفض حالة الأحرف — تماماً كأسلوب matchColumns هناك —
            // كي تُقبَل "Cost"/"COST" الإنكليزية أيضاً، لا الأحرف الصغيرة فقط.
            const costKeys = ["كلفة الشراء", "سعر الشراء", "الشراء", "التكلفة", "cost", "purchase"];
            const minStockKeys = ["حد إعادة الطلب", "الأدنى", "الادنى", "حد", "reorder", "minstock", "min"];
            const cIdx = header.findIndex((h) => costKeys.some((k) => h.toLowerCase().includes(k.toLowerCase())));
            const mIdx = header.findIndex((h) => minStockKeys.some((k) => h.toLowerCase().includes(k.toLowerCase())));
            if (bIdx === -1 || pIdx === -1) {
                toast.error("الملف يجب أن يحتوي عمودي «الباركود» و«السعر»");
                return;
            }
            const rows = raw
                .slice(1)
                .filter((r) => r && (r[bIdx] !== undefined || r[pIdx] !== undefined))
                .map((r) => {
                    const row: { barcode: string; price: number; isAvailable: boolean; costPrice?: number; minStock?: number } = {
                        barcode: String(r[bIdx] ?? "").trim(),
                        price: Number(r[pIdx]),
                        isAvailable: aIdx === -1 ? true : String(r[aIdx] ?? "نعم").includes("لا") ? false : true,
                    };
                    // خلية فارغة أو عمود غير موجود في الملف أصلاً → المفتاح لا
                    // يُرسَل إطلاقاً (لا 0 اصطناعية) — الخادم يعامل غيابه كـ"اترك
                    // القيمة المخزَّنة كما هي"، لا كـ"صفّرها".
                    if (cIdx !== -1 && r[cIdx] !== undefined && String(r[cIdx]).trim() !== "") {
                        row.costPrice = Number(r[cIdx]);
                    }
                    if (mIdx !== -1 && r[mIdx] !== undefined && String(r[mIdx]).trim() !== "") {
                        row.minStock = Number(r[mIdx]);
                    }
                    return row;
                });

            const res = await fetch("/api/warehouse-portal/catalog/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "فشل الاستيراد");
                return;
            }
            setReport(data as ImportReport);
            // تحديث القائمة بالكامل بعد الاستيراد
            const fresh = await fetchStockItems();
            if (fresh) setItems(fresh);
            toast.success(
                `الاستيراد: جديد ${data.imported} — محدّث ${data.updated} — فاشل ${data.failed}`
            );
        } finally {
            setImporting(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="أدويتي"
                description="الكتالوج الذي تراه الصيدليات عند بناء طلباتها — حدّد الأسعار والتوفر."
                actions={
                    <>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="بحث بالاسم أو الباركود…"
                            className="w-56 rounded-lg border bg-muted px-3 py-2 text-sm"
                        />
                        <button
                            onClick={downloadTemplate}
                            className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                        >
                            تنزيل القالب
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.csv"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                            }}
                        />
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={importing}
                            className="rounded-lg border bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                            {importing ? "جارٍ الاستيراد…" : "استيراد Excel"}
                        </button>
                        <button
                            onClick={() => setShowForm((s) => !s)}
                            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                        >
                            + إضافة صنف
                        </button>
                        {canEditPricing && (
                            <button
                                onClick={() => setShowBulk(true)}
                                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                            >
                                تعديل سعر جماعي{selected.size > 0 ? ` (${selected.size})` : ""}
                            </button>
                        )}
                    </>
                }
            />

            {showForm && (
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <h3 className="mb-1 font-bold">إضافة صنف بالباركود</h3>
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                        الباركود المسجل في الكتالوج العالمي يُضاف مباشرةً. الباركود غير المسجل
                        يُضاف تحت بند مذخرك بعد إدخال الاسم التجاري، ويبقى داخلياً عندك حتى
                        تُرقّيه إدارة المنصة إلى الكتالوج العالمي.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">الباركود *</label>
                            <input
                                value={form.barcode}
                                onChange={(e) => {
                                    // باركود جديد ⇒ سؤال الاسم لم يُحسم بعد لهذا الباركود.
                                    setNeedsName(false);
                                    setForm({ ...form, barcode: e.target.value });
                                }}
                                placeholder="الباركود"
                                className="w-48 rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        {needsName && (
                            <>
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-warning">
                                        الاسم التجاري * (باركود جديد)
                                    </label>
                                    <input
                                        value={form.tradeName}
                                        onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                                        placeholder="الاسم التجاري"
                                        className="w-48 rounded-lg border border-warning/40 bg-muted px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">
                                        المادة الفعالة (اختياري)
                                    </label>
                                    <input
                                        value={form.scientificName}
                                        onChange={(e) => setForm({ ...form, scientificName: e.target.value })}
                                        placeholder="المادة الفعالة"
                                        className="w-48 rounded-lg border bg-muted px-3 py-2 text-sm"
                                    />
                                </div>
                            </>
                        )}
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">سعر البيع (د.ع) *</label>
                            <input
                                value={form.price}
                                onChange={(e) => setForm({ ...form, price: e.target.value })}
                                placeholder="السعر"
                                inputMode="decimal"
                                className="w-32 rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">كلفة الشراء (اختياري)</label>
                            <input
                                value={form.costPrice}
                                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                                placeholder="الكلفة"
                                inputMode="decimal"
                                className="w-32 rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">حد إعادة الطلب (اختياري)</label>
                            <input
                                value={form.minStock}
                                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                                placeholder="الحد"
                                inputMode="numeric"
                                className="w-32 rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <button
                            onClick={addItem}
                            disabled={saving}
                            className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                        >
                            {saving ? "جارٍ الحفظ…" : "حفظ"}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        يُطابق الباركود الكتالوج العالمي — الأصناف غير المسجلة عالمياً أو بلا باركود تُرفض.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        تُستخدَم كلفة الشراء لاحتساب هامش الربح في التقارير — بدونها يظهر الهامش كغير معروفة.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        تنبيه عند نزول الرصيد لهذا الحد. صفر = بلا تنبيه.
                    </p>
                </div>
            )}

            {report && (
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <h3 className="font-bold">
                        تقرير الاستيراد: جديد {report.imported} — محدّث {report.updated} — فاشل {report.failed}
                    </h3>
                    {report.errors.length > 0 && (
                        <div className="mt-3 max-h-48 overflow-auto rounded-lg border p-3 text-sm">
                            {report.errors.map((e, i) => (
                                <div key={i} className="py-0.5 text-destructive">
                                    صف {e.row}
                                    {e.barcode ? ` (${e.barcode})` : ""}: {e.message}
                                </div>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => setReport(null)}
                        className="mt-3 text-sm text-muted-foreground underline"
                    >
                        إغلاق التقرير
                    </button>
                </div>
            )}

            {filtered.length === 0 ? (
                items.length === 0 ? (
                    <EmptyState
                        icon="📦"
                        title="كتالوجك فارغ"
                        description="أضف أصنافك فردية أو عبر ملف Excel لتظهر أمام الصيدليات."
                        action={
                            <button
                                onClick={() => setShowForm(true)}
                                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                            >
                                + إضافة صنف
                            </button>
                        }
                    />
                ) : (
                    <EmptyState icon="🔍" title="لا نتائج مطابقة للبحث." />
                )
            ) : (
                /* max-h + overflow-auto (لا overflow-x-auto فقط): ارتفاع محدود فعلياً
                   هو الشرط الوحيد الذي يجعل sticky على الترويسة يتفعَّل — حاوية
                   overflow-x-auto بلا حد ارتفاع تُصبح scrollport بلا تمرير رأسي
                   ممكن أصلاً، فتبقى sticky بلا أثر. */
                <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-muted text-right text-muted-foreground">
                            <tr>
                                {canEditPricing && (
                                    <th className="w-8 px-2 py-3">
                                        <input
                                            type="checkbox"
                                            checked={filtered.length > 0 && filtered.every((it) => selected.has(it.id))}
                                            onChange={(e) =>
                                                setSelected(e.target.checked ? new Set(filtered.map((it) => it.id)) : new Set())
                                            }
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-3 font-medium">الدواء</th>
                                <th className="px-4 py-3 font-medium">الباركود</th>
                                <th className="px-4 py-3 font-medium">السعر (د.ع)</th>
                                <th className="px-4 py-3 font-medium">البونص</th>
                                {canViewFinance && <th className="px-4 py-3 font-medium">كلفة الشراء</th>}
                                {canViewFinance && <th className="px-4 py-3 font-medium">هامش الربح</th>}
                                <th className="px-4 py-3 font-medium">حد إعادة الطلب</th>
                                <th className="px-4 py-3 font-medium">التوفر</th>
                                <th className="px-4 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((it) => (
                                <tr key={it.id} className="border-t">
                                    {canEditPricing && (
                                        <td className="px-2 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(it.id)}
                                                onChange={(e) =>
                                                    setSelected((prev) => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) next.add(it.id);
                                                        else next.delete(it.id);
                                                        return next;
                                                    })
                                                }
                                            />
                                        </td>
                                    )}
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{it.tradeName}</div>
                                        {it.scientificName && (
                                            <div className="text-xs text-muted-foreground">{it.scientificName}</div>
                                        )}
                                        {/* بلد المنشأ — من GlobalDrug.origin، عرض فقط. */}
                                        {it.origin && (
                                            <div className="text-xs text-muted-foreground">المنشأ: {it.origin}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">{it.barcode}</td>
                                    <td className="tabular-nums px-4 py-3">
                                        <PriceCell value={it.price} onCommit={(v) => updateFinanceItem(it.id, { price: v })} />
                                        {/* المرحلة ب: الرصيد القابل للبيع فعلياً (يستثني المنتهي) — بجانب السعر مباشرة. */}
                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                            القابل للبيع: {it.sellableQuantity.toLocaleString("ar-IQ")}
                                        </div>
                                        {canEditPricing && (
                                            <button
                                                onClick={() => setTierPricesFor(it)}
                                                className="mt-0.5 block text-xs text-primary hover:underline"
                                            >
                                                أسعار الشرائح
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <BonusRuleCell
                                            threshold={it.bonusThreshold}
                                            quantity={it.bonusQuantity}
                                            editable={canEditPricing}
                                            onCommit={(bonusThreshold, bonusQuantity) =>
                                                updateFinanceItem(it.id, { bonusThreshold, bonusQuantity })
                                            }
                                        />
                                    </td>
                                    {canViewFinance && (
                                        <td className="tabular-nums px-4 py-3">
                                            {/* كلفة الشراء — أساس احتساب هامش الربح؛ الخادم هو خط الدفاع الحقيقي
                                                لصلاحية canEditPricing بصرف النظر عمّا تُظهره هذه الخلية. */}
                                            <NumberCell
                                                value={it.costPrice}
                                                emptyLabel="غير معروفة"
                                                onCommit={(v) => updateFinanceItem(it.id, { costPrice: v })}
                                            />
                                        </td>
                                    )}
                                    {canViewFinance && (
                                        <td className="tabular-nums px-4 py-3">
                                            {it.marginPercent === null ? (
                                                <span className="text-xs text-muted-foreground">غير معروفة</span>
                                            ) : (
                                                <span
                                                    className={`text-sm ${
                                                        it.marginPercent < 0
                                                            ? "text-destructive"
                                                            : it.marginPercent === 0
                                                              ? "text-muted-foreground"
                                                              : "text-success"
                                                    }`}
                                                >
                                                    {it.marginPercent.toLocaleString("ar-IQ")}%
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    <td className="tabular-nums px-4 py-3">
                                        <NumberCell
                                            value={it.minStock}
                                            integer
                                            onCommit={(v) => updateFinanceItem(it.id, { minStock: v })}
                                        />
                                        {it.isLowStock && (
                                            <div className="mt-0.5">
                                                <StatusChip variant="warning" label="منخفض" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="space-y-1">
                                            {/* التوفر الفعلي كما تراه الصيدلية عند الطلب — deriveAvailability
                                                (معروض للبيع && رصيد > 0)، لا مجرد مفتاح isAvailable الخام. */}
                                            <StatusChip
                                                variant={it.availability ? "success" : "danger"}
                                                label={it.availability ? "متوفر فعلياً" : "غير متوفر"}
                                            />
                                            {/* مفتاح التاجر اليدوي فقط — قرار عرض، وليس تأكيداً لوجود رصيد. */}
                                            <button
                                                onClick={() => updateItem(it.id, { isAvailable: !it.isAvailable })}
                                                title="مفتاح العرض اليدوي — لا يعكس الرصيد الفعلي"
                                                className={`block w-full rounded-full border px-2.5 py-1 text-xs ${
                                                    it.isAvailable
                                                        ? "border-primary/30 text-primary hover:bg-primary/10"
                                                        : "border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                                                }`}
                                            >
                                                {it.isAvailable ? "معروض للبيع" : "غير معروض"}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-left">
                                        <button
                                            onClick={() => deleteItem(it.id)}
                                            className="text-xs text-destructive hover:underline"
                                        >
                                            حذف
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tierPricesFor && (
                <TierPricesModal item={tierPricesFor} onClose={() => setTierPricesFor(null)} />
            )}

            {showBulk && (
                <BulkPriceModal
                    scopeCount={selected.size > 0 ? selected.size : items.length}
                    onClose={() => setShowBulk(false)}
                    onApply={async (mode, value) => {
                        const res = await fetch("/api/warehouse-portal/catalog/bulk-price", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                mode,
                                value,
                                itemIds: selected.size > 0 ? Array.from(selected) : undefined,
                            }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            toast.error(data.error ?? "فشل في تطبيق التعديل الجماعي");
                            return false;
                        }
                        toast.success(`طُبِّق التعديل على ${data.updated} صنف`);
                        const fresh = await fetchStockItems();
                        if (fresh) setItems(fresh);
                        setSelected(new Set());
                        return true;
                    }}
                />
            )}
        </div>
    );
}

function TierPricesModal({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
    interface TierPriceRow {
        id: string;
        tier: string;
        price: number;
    }
    const [rows, setRows] = useState<TierPriceRow[] | null>(null);
    const [form, setForm] = useState({ tier: "", price: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/warehouse-portal/catalog/tier-prices?catalogItemId=${item.id}`);
                const data = await res.json().catch(() => ({}));
                if (!cancelled) setRows(res.ok ? data.tierPrices : []);
            } catch (e) {
                console.error("Failed to load tier prices:", e);
                if (!cancelled) setRows([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [item.id]);

    const save = async () => {
        const price = Number(form.price);
        if (!form.tier.trim() || !Number.isFinite(price) || price <= 0) {
            toast.error("أدخل اسم شريحة وسعراً موجباً");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/warehouse-portal/catalog/tier-prices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ catalogItemId: item.id, tier: form.tier.trim(), price }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "فشل في حفظ سعر الشريحة");
                return;
            }
            setRows((prev) => [...(prev ?? []).filter((r) => r.tier !== data.tierPrice.tier), data.tierPrice]);
            setForm({ tier: "", price: "" });
            toast.success("تم حفظ سعر الشريحة");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        const res = await fetch(`/api/warehouse-portal/catalog/tier-prices?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            toast.error(d.error ?? "فشل في الحذف");
            return;
        }
        setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
        toast.success("حُذف سعر الشريحة — يعود الصنف لسعر القائمة لهذه الشريحة");
    };

    return (
        <Modal open onClose={onClose} title={`أسعار الشرائح — ${item.tradeName}`} maxWidthClass="max-w-md">
            <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold">أسعار الشرائح — {item.tradeName}</h3>
                    <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">
                        إغلاق
                    </button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                    سعر القائمة الحالي: {item.price.toLocaleString("ar-IQ")} د.ع — يُطبَّق تلقائياً لأي صيدلية بلا شريحة أو بشريحة بلا سعر هنا.
                </p>

                {rows === null && <LoadingBlock />}
                {rows && rows.length === 0 && (
                    <div className="py-2 text-sm text-muted-foreground">لا توجد أسعار شرائح مخصَّصة لهذا الصنف بعد.</div>
                )}
                {rows && rows.length > 0 && (
                    <ul className="mb-3 space-y-1">
                        {rows.map((r) => (
                            <li key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                <span className="font-medium">{r.tier}</span>
                                <span>{r.price.toLocaleString("ar-IQ")} د.ع</span>
                                <button onClick={() => remove(r.id)} className="text-xs text-destructive hover:underline">
                                    حذف
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex items-center gap-2 border-t pt-3">
                    <input
                        value={form.tier}
                        onChange={(e) => setForm({ ...form, tier: e.target.value })}
                        placeholder="اسم الشريحة (GOLD…)"
                        className="w-32 rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                    <input
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        placeholder="السعر"
                        inputMode="decimal"
                        className="w-28 rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                    <button
                        onClick={save}
                        disabled={saving}
                        className="rounded-lg bg-success px-3 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                    >
                        {saving ? "…" : "حفظ"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function BulkPriceModal({
    scopeCount,
    onClose,
    onApply,
}: {
    scopeCount: number;
    onClose: () => void;
    onApply: (mode: "PERCENT" | "AMOUNT", value: number) => Promise<boolean>;
}) {
    const [mode, setMode] = useState<"PERCENT" | "AMOUNT">("PERCENT");
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const v = Number(value);
        if (!Number.isFinite(v) || v === 0) {
            toast.error("أدخل قيمة تعديل صحيحة (غير صفرية)");
            return;
        }
        setSaving(true);
        try {
            const ok = await onApply(mode, v);
            if (ok) onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title="تعديل سعر جماعي" maxWidthClass="max-w-sm">
            <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
                <h3 className="mb-1 font-bold">تعديل سعر جماعي</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                    سيُطبَّق على {scopeCount.toLocaleString("ar-IQ")} صنف. أي صنف ينتج عنه سعر صفري أو سالب يوقف العملية كاملة.
                </p>
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode("PERCENT")}
                            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === "PERCENT" ? "border-primary bg-primary/10 text-primary" : ""}`}
                        >
                            نسبة %
                        </button>
                        <button
                            onClick={() => setMode("AMOUNT")}
                            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === "AMOUNT" ? "border-primary bg-primary/10 text-primary" : ""}`}
                        >
                            مبلغ ثابت
                        </button>
                    </div>
                    <input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={mode === "PERCENT" ? "مثال: 10 أو -10" : "مثال: 500 أو -500"}
                        inputMode="decimal"
                        className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                        إلغاء
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || !value}
                        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {saving ? "جارٍ التطبيق…" : "تطبيق"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function PriceCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));

    if (!editing) {
        return (
            <button
                onClick={() => {
                    setDraft(String(value));
                    setEditing(true);
                }}
                className="font-medium hover:underline"
                title="انقر لتعديل السعر"
            >
                {value.toLocaleString("ar-IQ")}
            </button>
        );
    }
    return (
        <input
            autoFocus
            value={draft}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                const v = Number(draft);
                if (Number.isFinite(v) && v > 0 && v !== value) onCommit(v);
                setEditing(false);
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditing(false);
            }}
            className="w-24 rounded border bg-muted px-2 py-1 text-sm"
        />
    );
}

/**
 * ميزة البونص: خلية قاعدة البونص القياسية لصنف واحد — «اشترِ [threshold] خذ
 * [quantity] مجاناً». 0 في أي من الحقلين يعني "لا قاعدة بونص" (نفس تعريف
 * computeBonusUnits في app/lib/warehouse-bonus.ts)، فتُعرَض شرطة "—" بدل
 * الأرقام في وضع العرض. editable=false (canEditPricing غائبة) يعرض القيم
 * للقراءة فقط — الخادم هو خط الدفاع الحقيقي بصرف النظر، لكن لا داعٍ لإظهار
 * حقول تعديل لن يقبلها الخادم أصلاً.
 */
function BonusRuleCell({
    threshold,
    quantity,
    editable,
    onCommit,
}: {
    threshold: number;
    quantity: number;
    editable: boolean;
    onCommit: (threshold: number, quantity: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draftThreshold, setDraftThreshold] = useState(String(threshold || ""));
    const [draftQuantity, setDraftQuantity] = useState(String(quantity || ""));
    const hasRule = threshold > 0 && quantity > 0;

    if (!editable) {
        return hasRule ? (
            <span className="text-sm">
                اشترِ {threshold.toLocaleString("ar-IQ")} خذ {quantity.toLocaleString("ar-IQ")} مجاناً
            </span>
        ) : (
            <span className="text-xs text-muted-foreground">—</span>
        );
    }

    if (!editing) {
        return (
            <button
                onClick={() => {
                    setDraftThreshold(String(threshold || ""));
                    setDraftQuantity(String(quantity || ""));
                    setEditing(true);
                }}
                className={hasRule ? "text-sm hover:underline" : "text-xs text-muted-foreground hover:underline"}
                title="انقر لتعديل قاعدة البونص"
            >
                {hasRule
                    ? `اشترِ ${threshold.toLocaleString("ar-IQ")} خذ ${quantity.toLocaleString("ar-IQ")} مجاناً`
                    : "بلا قاعدة — انقر للإضافة"}
            </button>
        );
    }

    const commit = () => {
        const t = Number(draftThreshold || 0);
        const q = Number(draftQuantity || 0);
        const valid = Number.isFinite(t) && Number.isInteger(t) && t >= 0 && Number.isFinite(q) && Number.isInteger(q) && q >= 0;
        if (valid && (t !== threshold || q !== quantity)) onCommit(t, q);
        setEditing(false);
    };

    return (
        <div className="flex items-center gap-1 text-xs">
            اشترِ
            <input
                autoFocus
                value={draftThreshold}
                inputMode="numeric"
                onChange={(e) => setDraftThreshold(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(false);
                }}
                className="w-14 rounded border bg-muted px-1.5 py-1"
            />
            خذ
            <input
                value={draftQuantity}
                inputMode="numeric"
                onChange={(e) => setDraftQuantity(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(false);
                }}
                className="w-14 rounded border bg-muted px-1.5 py-1"
            />
            مجاناً
        </div>
    );
}

/**
 * خلية تعديل سطرية عامة لكلفة الشراء وحد إعادة الطلب — تشبه PriceCell أعلاه
 * حرفياً لكن تسمح بصفر (0 قيمة صالحة لكليهما: "كلفة غير معروفة" و"بلا تنبيه"
 * على التوالي)، بخلاف PriceCell التي ترفض 0 لأنها سعر بيع لا يجوز أن يكون
 * صفرياً. integer=true (لحد إعادة الطلب) يرفض القيم الكسرية أيضاً — الخادم هو
 * خط الدفاع الحقيقي (validateCostPrice/validateMinStock)، هذا فقط يمنع
 * إرسال طلب سيُرفَض أصلاً بلا داعٍ.
 *
 * emptyLabel: لكلفة الشراء تحديداً — 0/سالب تعني "لم تُدخَل بعد" (نفس تعريف
 * catalogMarginPercent)، فعرضها كرقم "٠" خام يوهم بأن الكلفة الفعلية صفر
 * دينار، وهو بالضبط الرقم المضلِّل الذي تحظره هذه الميزة أصلاً في عمود
 * الهامش المجاور. حين يُمرَّر emptyLabel وvalue <= 0 يُعرَض النص بدل الرقم
 * (لا يزال قابلاً للنقر والتعديل، والمسودة تبدأ فارغة لا "0").
 */
function NumberCell({
    value,
    onCommit,
    integer = false,
    emptyLabel,
}: {
    value: number;
    onCommit: (v: number) => void;
    integer?: boolean;
    emptyLabel?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value > 0 ? String(value) : "");
    const isEmpty = emptyLabel !== undefined && value <= 0;

    if (!editing) {
        return (
            <button
                onClick={() => {
                    setDraft(value > 0 ? String(value) : "");
                    setEditing(true);
                }}
                className={isEmpty ? "text-xs text-muted-foreground hover:underline" : "hover:underline"}
                title="انقر للتعديل"
            >
                {isEmpty ? emptyLabel : value.toLocaleString("ar-IQ")}
            </button>
        );
    }
    return (
        <input
            autoFocus
            value={draft}
            inputMode={integer ? "numeric" : "decimal"}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                const v = Number(draft);
                const valid = Number.isFinite(v) && v >= 0 && (!integer || Number.isInteger(v));
                if (valid && v !== value) onCommit(v);
                setEditing(false);
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditing(false);
            }}
            className="w-20 rounded border bg-muted px-2 py-1 text-sm"
        />
    );
}
