"use client";

import { useState, useActionState } from "react";
import { createInventory } from "@/app/lib/actions/inventory";
import Link from "next/link";
import { Package, ArrowRight, Pill, Calculator, Layers, AlertTriangle, TrendingUp } from "lucide-react";
import { SubmitButton } from "@/app/ui/submit-button";
import DrugCombobox from "@/app/ui/inventory/drug-combobox";
import type { DrugOption } from "@/app/api/inventory/drug-options/route";

interface Branch {
    id: string;
    name: string;
}

const fmt = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 2 });
const inputClass =
    "w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

function Section({ step, title, hint, icon: Icon, children }: {
    step: number; title: string; hint: string; icon: React.ElementType; children: React.ReactNode;
}) {
    return (
        <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground">
                        <span className="me-1.5 text-muted-foreground tabular-nums">{step}.</span>
                        {title}
                    </h2>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
            </header>
            <div className="space-y-5 p-5">{children}</div>
        </section>
    );
}

export default function CreateInventoryForm({ branches, minMargin }: { branches: Branch[]; minMargin: number }) {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useActionState(createInventory, initialState);
    const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : "");
    const [drug, setDrug] = useState<DrugOption | null>(null);
    const [drugMissing, setDrugMissing] = useState(false);
    const [price, setPrice] = useState("");
    const [packetPrice, setPacketPrice] = useState<number>(0);
    const [stripsPerPacket, setStripsPerPacket] = useState<number>(1);
    const computedCost = stripsPerPacket > 0 ? packetPrice / stripsPerPacket : 0;

    const salePrice = parseFloat(price) || 0;
    const profit = salePrice - computedCost;
    const margin = computedCost > 0 ? (profit / computedCost) * 100 : null;
    const belowCost = salePrice > 0 && computedCost > 0 && profit < 0;
    const belowMargin = margin !== null && salePrice > 0 && !belowCost && margin < minMargin;

    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        // الحقل المخفي drugId لا يخضع لتحقق المتصفح، فيُفحص هنا.
        if (!drug || drug.inBranch) {
            e.preventDefault();
            setDrugMissing(true);
            document.getElementById("drugSearch")?.focus();
            return;
        }
        // عدد الأشرطة في الباكيت مرتفع جداً = غالباً أُدخل إجمالي الأشرطة بالخطأ
        if (
            stripsPerPacket > 20 &&
            !window.confirm(
                `تنبيه: عدد الأشرطة في الباكيت (${stripsPerPacket}) يبدو غير صحيح.\n` +
                `هذا الحقل يعني عدد الأشرطة داخل الباكيت الواحد، وليس إجمالي الأشرطة المستلمة.\n` +
                `سعر التكلفة للشريط سيُحسب: ${packetPrice} ÷ ${stripsPerPacket} = ${fmt(computedCost)} د.ع\n` +
                `هل أنت متأكد من المتابعة؟`,
            )
        ) {
            e.preventDefault();
        }
    };

    return (
        <form action={dispatch} onSubmit={onSubmit} className="space-y-5">
            {/* 1. الدواء والفرع */}
            <Section step={1} title="الدواء والفرع" hint="ابحث عن الدواء في كتالوج المنصة أو امسح باركوده" icon={Pill}>
                {branches.length === 1 ? (
                    <input type="hidden" name="branchId" value={branches[0].id} />
                ) : (
                    <div>
                        <label htmlFor="branchId" className="mb-2 block text-sm font-bold text-foreground">
                            الفرع
                        </label>
                        <select
                            id="branchId"
                            name="branchId"
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            className={inputClass}
                            required
                        >
                            <option value="">اختر الفرع</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                </option>
                            ))}
                        </select>
                        {state.errors?.branchId && (
                            <p className="mt-1 text-sm text-destructive">{state.errors.branchId}</p>
                        )}
                    </div>
                )}

                <div>
                    <label htmlFor="drugSearch" className="mb-2 block text-sm font-bold text-foreground">
                        الدواء
                    </label>
                    <DrugCombobox
                        branchId={branchId}
                        value={drug}
                        onChange={(d) => { setDrug(d); if (d && !d.inBranch) setDrugMissing(false); }}
                        invalid={drugMissing}
                    />
                    <input type="hidden" name="drugId" value={drug?.id ?? ""} />
                    {drugMissing && !drug && (
                        <p className="mt-1 text-sm text-destructive">اختر الدواء من نتائج البحث.</p>
                    )}
                    {state.errors?.drugId && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.drugId}</p>
                    )}
                </div>
            </Section>

            {/* 2. التسعير */}
            <Section step={2} title="التسعير" hint="سعر البيع للشريط، والتكلفة تُحسب من سعر الباكيت" icon={Calculator}>
                <div>
                    <label htmlFor="price" className="mb-2 block text-sm font-bold text-foreground">
                        سعر البيع للشريط
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            id="price"
                            name="price"
                            step="0.01"
                            min="0"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0"
                            className={`${inputClass} pe-14 tabular-nums`}
                            required
                        />
                        <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">د.ع</span>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="packetPrice" className="mb-2 block text-sm font-bold text-foreground">سعر الباكيت (شراء)</label>
                        <input
                            type="number"
                            id="packetPrice"
                            min="0"
                            step="any"
                            value={packetPrice || ""}
                            onChange={e => setPacketPrice(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className={`${inputClass} tabular-nums`}
                        />
                    </div>
                    <div>
                        <label htmlFor="stripsPerPacket" className="mb-2 block text-sm font-bold text-foreground">عدد الأشرطة في الباكيت</label>
                        <input
                            type="number"
                            id="stripsPerPacket"
                            min="1"
                            step="1"
                            value={stripsPerPacket || ""}
                            onChange={e => setStripsPerPacket(Math.max(1, parseInt(e.target.value) || 1))}
                            placeholder="1"
                            className={`${inputClass} tabular-nums`}
                        />
                    </div>
                </div>
                {stripsPerPacket > 20 && (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-warning">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        هذا الحقل هو عدد الأشرطة داخل الباكيت الواحد وليس إجمالي الأشرطة — سيظهر تأكيد عند الحفظ
                    </p>
                )}
                <input type="hidden" name="cost" value={computedCost} />

                {/* ملخص التكلفة والربح */}
                <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border overflow-hidden rounded-lg border border-border bg-muted/40 text-center">
                    <div className="px-3 py-3">
                        <p className="text-[11px] text-muted-foreground">تكلفة الشريط</p>
                        <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{packetPrice > 0 ? fmt(computedCost) : "—"}</p>
                    </div>
                    <div className="px-3 py-3">
                        <p className="text-[11px] text-muted-foreground">الربح للشريط</p>
                        <p className={`mt-1 text-sm font-bold tabular-nums ${salePrice > 0 && packetPrice > 0 ? (profit >= 0 ? "text-success" : "text-destructive") : "text-foreground"}`}>
                            {salePrice > 0 && packetPrice > 0 ? fmt(profit) : "—"}
                        </p>
                    </div>
                    <div className="px-3 py-3">
                        <p className="text-[11px] text-muted-foreground">هامش الربح</p>
                        <p className={`mt-1 flex items-center justify-center gap-1 text-sm font-bold tabular-nums ${belowCost ? "text-destructive" : belowMargin ? "text-warning" : margin !== null && salePrice > 0 ? "text-success" : "text-foreground"}`}>
                            {margin !== null && salePrice > 0 ? <><TrendingUp className="h-3.5 w-3.5" />{fmt(Math.round(margin * 10) / 10)}٪</> : "—"}
                        </p>
                    </div>
                </div>
                {belowCost && (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        سعر البيع أقل من تكلفة الشريط.
                    </p>
                )}
                {belowMargin && (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-warning">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        الهامش أقل من الحد الأدنى المحدد لمؤسستك ({fmt(minMargin)}٪).
                    </p>
                )}
            </Section>

            {/* 3. حدود المخزون */}
            <Section step={3} title="حدود المخزون" hint="تُستخدم لتنبيهات النقص واقتراحات الشراء" icon={Layers}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="minStock" className="mb-2 block text-sm font-bold text-foreground">
                            الحد الأدنى للمخزون
                        </label>
                        <input
                            type="number"
                            id="minStock"
                            name="minStock"
                            min="0"
                            defaultValue={0}
                            className={`${inputClass} tabular-nums`}
                        />
                    </div>
                    <div>
                        <label htmlFor="maxStock" className="mb-2 block text-sm font-bold text-foreground">
                            الحد الأقصى للمخزون
                        </label>
                        <input
                            type="number"
                            id="maxStock"
                            name="maxStock"
                            min="1"
                            defaultValue={1000}
                            className={`${inputClass} tabular-nums`}
                        />
                    </div>
                </div>
            </Section>

            {/* رسالة الخطأ */}
            {state.message && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {state.message}
                </div>
            )}

            {/* الأزرار */}
            <div className="flex flex-wrap gap-3">
                <SubmitButton
                    text="إضافة للمخزون"
                    loadingText="جاري الإضافة..."
                    icon={Package}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-auto px-6 py-3 h-auto"
                />
                <Link
                    href="/dashboard/inventory"
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
