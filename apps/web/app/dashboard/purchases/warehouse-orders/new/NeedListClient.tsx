'use client';

// المرحلة 3 و4 من خطة «طلب الأدوية حسب الاحتياج»: قائمة الاحتياج ثم المراجعة والإرسال.
//
// التدفق: اختر فرع الاستلام → ابحث وأضف الأدوية والكميات → النظام يجلب أرخص «آخر
// سعر لكل مورد» → غيّر المورد إن شئت → راجع المجموعات (طلب لكل مذخر) → أرسل.
//
// أهم القواعد المطبَّقة هنا:
//  §70 إضافة نفس الدواء تُركِّز سطره ولا تُنشئ سطراً مكرراً.
//  §71 الكميات أعداد صحيحة موجبة (والخادم يفحص أيضاً).
//  §78 الأرخص قد يكون غير قابل للإرسال — يُعرض ومعه أرخص خيار قابل للإرسال، بلا استبدال صامت.
//  §79 إعادة جلب الأسعار لا تُغيّر اختياراً يدوياً.
//  §82 الإجمالي يُسمّى «إجمالي الأصناف المسعّرة تقديرياً» مع عدد غير المسعّرة.
//  §189 التجميع بـ warehouseId الحقيقي لا باسم المورد.
//  §191-193 مفتاح idempotency مستقل لكل مجموعة، يُنشأ مرة عند تثبيت الحمولة؛ وإعادة
//      المحاولة بعد فشل غير مؤكد تُعيد **نفس** المفتاح ولا تنشئ جديداً.
//  §195 المجموعة الناجحة تصير للعرض فقط ولا تدخل إعادة الإرسال.
//  §197 تجاوز حد 100 صنف يظهر قبل أي إرسال.
//  §199 حالة الإرسال في sessionStorage بمفتاح المستخدم والمؤسسة والفرع، وتُمسح عند الاكتمال.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    ShoppingCart, Trash2, Loader2, AlertTriangle, Check, Printer, ArrowRight,
    Building2, BarChart3, Info, ChevronDown,
} from 'lucide-react';
import DrugSearchBox from './DrugSearchBox';
import PriceCompareModal from './PriceCompareModal';
import { resumeUnsentLines } from './resume-list';
import {
    type NeedLine, type DrugSearchResult, type DrugComparison, type ActiveWarehouse, type OrgSupplier,
    formatIQD, formatDate, selectedOption, priceDrift, QUALITY_LABEL, QUALITY_FIX,
} from './types';
import {
    applyOrderTarget, classifyNeedLines, currentTargetValue, encodeOrderTarget, groupBlockedBySupplier,
    splitWarehousesByRelation, warehousesNeedingDuplicateConfirm, type BlockedLine,
} from './need-line-routing';
// ميزة وحدة التسعير (§302): المذخر يسعّر بالباكيت والكمية هنا بالباكيت، لكن
// opt.price سعر شريط دوماً. هذه الدالة نقطة التحويل الوحيدة عند العرض والحمولة.
import { resolveLinePrice } from './need-line-pricing';
// نفس القاعدة الحسابية المستعملة في PriceCompareModal.tsx للسطر الإضافي —
// «الباكيت (N): X» — لا ضرب مباشر مكرَّر هنا أيضاً.
import { toPacketPrice } from '@/app/lib/pack-units';
// التقسيم والمفاتيح وإعادة المحاولة منطق نقي مُختبَر في
// app/lib/warehouse-order-grouping.ts — لا يُكرَّر هنا، لأن إعداد الاختبارات في
// هذا المستودع لا يُحمِّل ملفات .tsx فكان سيبقى بلا تغطية.
import {
    buildSendGroups, groupsToSend, oversizedGroups, canSubmit,
    type SendGroupPlan, type GroupableLine, restoreSendGroups, executeSendAttempt,
} from '@/app/lib/warehouse-order-grouping';

/** مجموعة العرض = خطة الإرسال المُختبَرة + أسطر الواجهة الكاملة لعرض تفاصيلها. */
type SendGroup = SendGroupPlan;

export default function NeedListClient({
    userId,
    organizationId,
    fixedBranchId,
    branches,
}: {
    userId: string;
    organizationId: string;
    fixedBranchId: string | null;
    branches: Array<{ id: string; name: string }>;
}) {
    const [branchId, setBranchId] = useState<string>(fixedBranchId ?? (branches.length === 1 ? branches[0].id : ''));
    const [lines, setLines] = useState<NeedLine[]>([]);
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [compareLine, setCompareLine] = useState<string | null>(null);
    // الأسطر الموسَّعة: §79 يمنع استبدال الاختيار اليدوي، لكن الصفّ كان يخفي معه
    // بقية الموردين تماماً — فلا يرى المستخدم أن هناك أرخص منه ولا تواريخ الأسعار.
    // التوسيع يُظهرها داخل الجدول، ونافذة المقارنة تبقى للسجل الكامل والمصادر.
    const [expandedRows, setExpandedRows] = useState<string[]>([]);
    const [stage, setStage] = useState<'BUILD' | 'REVIEW'>('BUILD');
    const [groups, setGroups] = useState<SendGroup[]>([]);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    const sendLock = useRef(false);
    const [legacyPending, setLegacyPending] = useState(false);
    const [legacyReviewed, setLegacyReviewed] = useState(false);
    const originalLines = useRef<NeedLine[]>([]);
    const [recoveryRevision, setRecoveryRevision] = useState(0);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [disclaimer, setDisclaimer] = useState<string | null>(null);
    // جهات الطلب لصنف بلا سعر مؤهل: مذاخر المنصة النشطة (طلب تسعير §81) وموردو
    // المؤسسة غير المربوطين (طلب يدوي).
    const [warehouses, setWarehouses] = useState<ActiveWarehouse[]>([]);
    const [orgSuppliers, setOrgSuppliers] = useState<OrgSupplier[]>([]);
    // تأكيد صريح لكل مذخر يُحتمل أنه أحد الموردين المحليين (تحذير لا منع).
    const [duplicateConfirmed, setDuplicateConfirmed] = useState<Record<string, boolean>>({});
    const priceVersions = useRef<Record<string, number>>({});
    const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

    const storageKey = `wh-need-send-v2:${userId}:${organizationId}:${branchId}`;

    useEffect(() => {
        fetch('/api/purchases/order-targets', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : { warehouses: [], suppliers: [] }))
            .then((d) => {
                setWarehouses(d.warehouses ?? []);
                setOrgSuppliers(d.suppliers ?? []);
            })
            .catch(() => {
                setWarehouses([]);
                setOrgSuppliers([]);
            });
    }, []);

    const warehouseSections = useMemo(() => splitWarehousesByRelation(warehouses), [warehouses]);
    const manualSuppliers = useMemo(() => orgSuppliers.filter((s) => !s.warehouseId), [orgSuppliers]);

    useEffect(() => {
        if (!branchId) return;
        try {
            const legacy = sessionStorage.getItem(`wh-need-send:${userId}:${organizationId}:${branchId}`);
            setLegacyPending(!!legacy);
            setLegacyReviewed(false);
            if (legacy) throw new Error('توجد عملية من النسخة السابقة بلا حمولة محفوظة. راجع الطلبات المسجلة قبل حذف سجل الجلسة القديم.');
            const raw = sessionStorage.getItem(storageKey);
            if (!raw) { setRecoveryError(null); return; }
            const saved = JSON.parse(raw);
            if (saved.version !== 2 || !Array.isArray(saved.blocked)) throw new Error('سجل الجلسة غير صالح');
            if ((saved.draft !== undefined && !Array.isArray(saved.draft)) ||
                (saved.originalLines !== undefined && !Array.isArray(saved.originalLines))) throw new Error('قائمة الجلسة غير صالحة');
            const recovered = restoreSendGroups(saved.groups, branchId);
            setGroups(recovered);
            originalLines.current = saved.originalLines ?? [];
            setLines(saved.draft ?? saved.blocked);
            setNotes(saved.draft ? saved.notes ?? {} : Object.fromEntries(recovered.map(g => [g.warehouseId, g.payload?.notes ?? (typeof saved.notes?.[g.warehouseId] === 'string' ? saved.notes[g.warehouseId] : '')])));
            setStage(saved.draft ? 'BUILD' : 'REVIEW');
            if (saved.draft?.length) void fetchComparisons(saved.draft);
            setRecoveryError(null);
        } catch (error) {
            setRecoveryError(error instanceof Error ? error.message : 'تعذر استرداد العملية السابقة');
        }
    }, [storageKey, branchId, userId, organizationId, recoveryRevision]);

    // ── جلب المقارنة للأسطر التي لا مقارنة لها ───────────────────────────────
    const fetchComparisons = useCallback(
        async (targets: NeedLine[]) => {
            const ids = targets.map((l) => l.drugId);
            if (ids.length === 0) return;
            if (targets.length > 50) {
                for (let i = 0; i < targets.length; i += 50) await fetchComparisons(targets.slice(i, i + 50));
                return;
            }
            const versions = Object.fromEntries(ids.map(id => [id, priceVersions.current[id] = (priceVersions.current[id] ?? 0) + 1]));
            setLoadingPrices(true);
            try {
                const res = await fetch('/api/purchases/supplier-prices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ drugIds: ids, verifiedUnitDrugIds: targets.filter(l => l.unitConfirmed).map(l => l.drugId) }),
                });
                const data = await res.json();
                if (!res.ok) {
                    toast.error(data.error ?? 'فشل في جلب الأسعار');
                    return;
                }
                if (data.disclaimer) setDisclaimer(data.disclaimer);
                const comparisons = data.comparisons as Record<string, DrugComparison>;
                // ميزة وحدة التسعير: تعبئة موثّقة لكل دواء (null = غير موثّقة).
                const packs = (data.unitsPerPack ?? {}) as Record<string, number | null>;
                const requested = new Set(ids);
                setLines((prev) =>
                    prev.map((l) => {
                        if (!requested.has(l.drugId)) return l;
                        if (versions[l.drugId] !== priceVersions.current[l.drugId]) return l;
                        // دواء بلا أي تاريخ سعر لا يعود له مدخل في comparisons أصلاً
                        // (الخادم يبنيها من سجلات موجودة). تركه على null كان يُبقي
                        // صفّه يدور إلى الأبد ويحجب لوحة توثيق التعبئة — فيُسجّل مقارنة
                        // فارغة صريحة: «جاء الجواب ولا أسعار» تختلف عن «لم يصل الجواب».
                        const c = comparisons[l.drugId] ?? {
                            cheapest: null,
                            cheapestOrderable: null,
                            options: [],
                            hasPrice: false,
                        };
                        l = { ...l, unitsPerPack: packs[l.drugId] ?? null };
                        // §79: الاختيار اليدوي لا يُستبدل عند إعادة الجلب.
                        return { ...l, comparison: c };
                    })
                );
            } catch {
                toast.error('تعذّر الاتصال بالخادم لجلب الأسعار');
            } finally {
                setLoadingPrices(false);
            }
        },
        []
    );

    const addDrug = (d: DrugSearchResult) => {
        const existing = lines.find((l) => l.drugId === d.id || (d.barcode && l.barcode === d.barcode));
        if (existing) {
            // §70: تركيز السطر الموجود بدل تكراره.
            rowRefs.current[d.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            rowRefs.current[d.id]?.classList.add('ring-2', 'ring-primary');
            setTimeout(() => rowRefs.current[d.id]?.classList.remove('ring-2', 'ring-primary'), 1200);
            toast.info('الصنف مضاف بالفعل — عدّل كميته من السطر.');
            return;
        }
        const line: NeedLine = {
            drugId: d.id,
            globalDrugId: d.globalDrugId,
            barcode: d.barcode,
            tradeName: d.tradeName,
            scientificName: d.scientificName,
            currentStock: d.currentStock,
            inInventory: d.inInventory,
            orderability: d.orderability,
            orderabilityReason: d.orderabilityReason,
            quantity: 1,
            comparison: null,
            selectedSupplierId: null,
            manuallyChosen: false,
            chosenPriceAtSelection: null,
            manualWarehouseId: null,
            manualWarehouseName: null,
        };
        setLines((prev) => [...prev, line]);
        fetchComparisons([line]);
    };

    const setQuantity = (drugId: string, raw: string) => {
        const n = Number(raw);
        // §71: عدد صحيح موجب آمن؛ ما دون ذلك يُقصّ إلى 1.
        const q = Number.isInteger(n) && n > 0 && n <= 1_000_000 ? n : 1;
        setLines((prev) => prev.map((l) => (l.drugId === drugId ? { ...l, quantity: q } : l)));
    };

    const chooseSupplier = (drugId: string, supplierId: string) => {
        setLines((prev) =>
            prev.map((l) => {
                if (l.drugId !== drugId) return l;
                const opt = l.comparison?.options.find((o) => o.supplierId === supplierId) ?? null;
                return {
                    ...l,
                    selectedSupplierId: supplierId,
                    manuallyChosen: true,
                    // لقطة السعر لحظة الاختيار — أساس كشف التغيّر لاحقاً (§79).
                    chosenPriceAtSelection: opt?.price ?? null,
                    manualWarehouseId: null,
                    manualWarehouseName: null,
                };
            })
        );
        setCompareLine(null);
    };

    /**
     * جهة يدوية لصنف بلا سعر مؤهل: مذخر (طلب تسعير إلكتروني §81) أو مورد محلي غير
     * مربوط (طلب يدوي). التحقق من القيمة الموسومة في applyOrderTarget المُختبَرة.
     */
    const chooseTarget = (drugId: string, value: string) => {
        setLines((prev) =>
            prev.map((l) => (l.drugId === drugId ? applyOrderTarget(l, value, warehouses, orgSuppliers) : l))
        );
    };

    /** يقبل المستخدمُ السعرَ الجديد بعد إظهار تغيّره — تُحدَّث اللقطة فيختفي التنبيه. */
    const acknowledgeDrift = (drugId: string) => {
        setLines((prev) =>
            prev.map((l) => {
                if (l.drugId !== drugId) return l;
                const opt = selectedOption(l);
                return { ...l, chosenPriceAtSelection: opt?.price ?? null };
            })
        );
    };

    const removeLine = (drugId: string) =>
        setLines((prev) => prev.filter((l) => l.drugId !== drugId));

    const toggleExpanded = (drugId: string) =>
        setExpandedRows((prev) =>
            prev.includes(drugId) ? prev.filter((id) => id !== drugId) : [...prev, drugId]
        );

    // ── تصنيف الأسطر: قابل للإرسال أو لا ─────────────────────────────────────
    // المنطق في need-line-routing.ts المُختبَرة: مورد محلي لا يدخل أي طلب إلكتروني.
    const classified = useMemo(() => classifyNeedLines(lines), [lines]);

    const totals = useMemo(() => {
        let total = 0;
        let priced = 0;
        let unpriced = 0;
        for (const l of lines) {
            const opt = selectedOption(l);
            if (opt?.comparable && opt.price !== null) {
                // §302: الإجمالي التقديري بوحدة الباكيت حين تُعرَف تعبئته، وإلا
                // يبقى بسعر الشريط (لا اختراع رقم) — نفس القاعدة المعروضة بالسطر.
                const display = resolveLinePrice(opt.price, l.unitsPerPack);
                if (display.amount !== null) total += display.amount * l.quantity;
                priced += 1;
            } else {
                unpriced += 1;
            }
        }
        return { total, priced, unpriced };
    }, [lines]);

    // ── بناء المجموعات عند الدخول للمراجعة: هنا تُثبَّت الحمولة والمفاتيح (§191) ──
    const enterReview = () => {
        if (recoveryError || sending || loadingPrices || lines.some(l => !l.comparison)) return;
        const groupable: GroupableLine[] = classified.sendable.map((s) => ({
            drugId: s.line.drugId,
            tradeName: s.line.tradeName,
            barcode: s.line.barcode,
            quantity: s.line.quantity,
            warehouseId: s.warehouseId,
            warehouseName: s.warehouseName,
            supplierName: s.supplierName,
            // §302: s.price سعر شريط (classifyNeedLines لا يحوّله). الكمية هنا
            // باكيتات، فيجب أن يكون unitPrice سعر باكيت حين تُعرف التعبئة —
            // وإلا يبقى سعر الشريط كما كان (لا اختراع رقم بلا عدد أشرطة).
            unitPrice: resolveLinePrice(s.price, s.line.unitsPerPack).amount,
        }));

        originalLines.current = [...lines];
        const built = buildSendGroups(groupable, () => crypto.randomUUID());

        setGroups(built);
        setStage('REVIEW');
    };

    const persist = (gs: SendGroup[]) => {
        // Keep only the unresolved manual list, never every supplier's price history.
        const blocked = classified.blocked.map(({line}) => ({ ...line, comparison: null }));
        sessionStorage.setItem(storageKey, JSON.stringify({ version: 2, groups: gs, blocked, notes, originalLines: (originalLines.current.length ? originalLines.current : lines).map(l => ({ ...l, comparison: null })) }));
    };

    const submitAll = async () => {
        if (sendLock.current || recoveryError || !canSubmit(groups).ok || unconfirmedDuplicates.length > 0) return;
        sendLock.current = true;
        setSending(true);
        try {
            let current = [...groups];
            for (let i = 0; i < current.length; i++) {
                // §195: الناجحة لا تُعاد — نفس شرط groupsToSend المُختبَر.
                if (current[i].status === 'SENT') continue;
                current[i] = await executeSendAttempt(current[i], branchId, notes[current[i].warehouseId] ?? null,
                    state => {
                        current[i] = state;
                        setGroups([...current]);
                        persist(current);
                    },
                    async payload => {
                        const res = await fetch('/api/warehouses/orders', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
                        });
                        return { status: res.status, data: await res.json().catch(() => null) };
                    });
            }
            const allSent = current.every((g) => g.status === 'SENT');
            if (allSent) {
                toast.success('أُرسلت كل الطلبات.');
            } else {
                // §102: لا انتقال تلقائي ما دامت هناك مجموعة لم تُرسل.
                toast.error('بقيت مجموعات لم تُرسل — راجعها وأعد المحاولة.');
            }
        } catch {
            toast.error('تعذر حفظ حالة الإرسال. لم تبدأ أي محاولة إضافية؛ احتفظ بهذه الصفحة وأعد المحاولة.');
        } finally {
            sendLock.current = false;
            setSending(false);
        }
    };

    const startNew = () => {
        if (sending || recoveryError) return;
        try {
            const draft = resumeUnsentLines(groups, classified.blocked.map(b => b.line),
                originalLines.current.length ? originalLines.current : lines);
            const draftNotes = Object.fromEntries(groups.filter(g => g.status !== 'SENT')
                .map(g => [g.warehouseId, notes[g.warehouseId] ?? '']));
            // Save the replacement before changing the UI; retain the previous
            // snapshot for reference without ever resubmitting successful groups.
            sessionStorage.setItem(`${storageKey}:previous`, JSON.stringify({ groups, notes }));
            sessionStorage.setItem(storageKey, JSON.stringify({ version: 2, groups: [], blocked: [], draft, notes: draftNotes, originalLines: draft }));
            originalLines.current = draft;
            setGroups([]); setLines(draft); setNotes(draftNotes); setStage('BUILD');
            if (draft.length) void fetchComparisons(draft);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'تعذر حفظ القائمة.');
        }
    };

    const resolveLegacy = () => {
        if (!legacyReviewed || sending) return;
        try {
            const key = `wh-need-send:${userId}:${organizationId}:${branchId}`;
            const old = sessionStorage.getItem(key);
            if (old) sessionStorage.setItem(`${key}:reviewed:${Date.now()}`, old);
            sessionStorage.removeItem(key);
            setLegacyPending(false); setRecoveryError(null);
            setRecoveryRevision(v => v + 1);
        } catch {
            toast.error('تعذر حفظ مراجعة الجلسة القديمة. لم تُفتح عملية إرسال جديدة.');
        }
    };

    const confirmUnit = (drugId: string, checked: boolean) => {
        const updated = lines.map(l => l.drugId === drugId ? { ...l, unitConfirmed: checked, comparison: null } : l);
        setLines(updated);
        fetchComparisons(updated.filter(l => l.drugId === drugId));
    };

    /**
     * أسطر فُتح عليها مُنتقي جهة الطلب يدوياً رغم وجود سعر مؤهل.
     *
     * كان المُنتقي يظهر فقط حين لا يوجد سعر، فيصير وجود السعر سبباً لإخفاء
     * أداة القرار — وهذا خلط بين سؤالين: «بكم اشتريتُ وممّن؟» تاريخ يُقيّد
     * بمن له سعر بحق، و«إلى أين أرسل هذا الطلب؟» قرار تجاري لا سبب لتقييده
     * بالتاريخ. المذخر يحمل آلاف الأصناف، وعدم شرائك صنفاً منه من قبل
     * لا يقول شيئاً عن توفّره عنده — بل طلب التسعير منه هو جوهر البوابة.
     */
    const [targetPickerOpen, setTargetPickerOpen] = useState<Set<string>>(new Set());
    const toggleTargetPicker = (drugId: string) =>
        setTargetPickerOpen((prev) => {
            const next = new Set(prev);
            if (next.has(drugId)) next.delete(drugId);
            else next.add(drugId);
            return next;
        });

    /** ما كتبه المستخدم في خانة التعبئة قبل حفظها، لكل دواء. */
    const [packDraft, setPackDraft] = useState<Record<string, string>>({});
    const [savingPack, setSavingPack] = useState<string | null>(null);

    /**
     * توثيق دائم لعدد الأشرطة — بديل التأشيرة المؤقتة.
     *
     * التأشيرة كانت تقول «راجعتُ الوحدة» لهذا الطلب وحده، فيعود السؤال في
     * كل طلب ولا تستفيد منها بقية النظام. حفظ العدد يعالج السبب مرة
     * واحدة: تصير أسعار الدواء مؤهلة للمقارنة وقابلة للاختيار، ويظهر سعر
     * الباكيت، وتستفيد نافذة الدفعة وكل من يستعمل هذا الباركود من نفس الرقم.
     */
    const savePackUnits = async (drugId: string) => {
        const raw = packDraft[drugId] ?? '';
        const value = parseInt(raw, 10);
        if (!Number.isInteger(value) || value <= 0) {
            toast.error('اكتب عدد أشرطة صحيحاً (اعدُدها من العلبة).');
            return;
        }
        setSavingPack(drugId);
        try {
            const res = await fetch('/api/inventory/pack-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drugId, unitsPerPack: value }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error ?? 'فشل حفظ عدد الأشرطة'); return; }
            toast.success('تم توثيق التعبئة — لن يُطلب منك مجدداً.');
            // إعادة الجلب هي ما يحوّل الأسعار إلى مؤهلة: بوابة الوحدة في
            // الخادم تقرأ unitsPerPackConfirmedAt الذي كُتِب للتوّ.
            const updated = lines.map(l =>
                l.drugId === drugId ? { ...l, unitsPerPack: value, comparison: null } : l,
            );
            setLines(updated);
            fetchComparisons(updated.filter(l => l.drugId === drugId));
        } finally {
            setSavingPack(null);
        }
    };

    const printManual = () => window.print();

    const activeLine = lines.find((l) => l.drugId === compareLine) ?? null;
    const oversize = oversizedGroups(groups) as SendGroup[];
    const remaining = groupsToSend(groups).length;
    const submitVerdict = canSubmit(groups);
    const unconfirmedDuplicates = warehousesNeedingDuplicateConfirm(
        groupsToSend(groups).map((g) => g.warehouseId),
        warehouses
    ).filter((id) => !duplicateConfirmed[id]);

    // ── واجهة ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6" dir="rtl">
            {recoveryError && <div role="alert" className="rounded border p-4 text-destructive">{recoveryError} <Link href="/dashboard/purchases/warehouse-orders" target="_blank" rel="noopener noreferrer">متابعة الطلبات</Link>
                {legacyPending && <div className="mt-3 space-y-2">
                    <p>راجع الطلبات في الصفحة الأخرى، وتحقق من عدم وجود إرسال سابق معلّق قبل المتابعة. ستُحفظ نسخة من سجل الجلسة القديمة.</p>
                    <label className="block"><input type="checkbox" checked={legacyReviewed} onChange={e => setLegacyReviewed(e.target.checked)} /> راجعت الطلبات وحسمت نتيجة الإرسال السابق</label>
                    <button disabled={!legacyReviewed} onClick={resolveLegacy} className="rounded border px-3 py-2 disabled:opacity-50">حفظ المراجعة والمتابعة</button>
                </div>}
            </div>}
            <div className="print:hidden">
                <h1 className="text-2xl font-bold text-foreground">طلب أدوية من المذاخر</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    اكتب ما تحتاجه وكمياته، وسنعرض لك أرخص سعر بين آخر أسعار مورّديك لكل صنف —
                    ثم نقسّم الطلب مذخراً مذخراً.
                </p>
            </div>

            {/* فرع الاستلام */}
            <div className="rounded-xl border border-border bg-card p-4 print:hidden">
                <label className="mb-1.5 block text-xs font-bold text-foreground">فرع الاستلام</label>
                {fixedBranchId ? (
                    <p className="flex items-center gap-2 text-sm text-foreground">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {branches.find((b) => b.id === fixedBranchId)?.name ?? 'فرعك'}
                        <span className="text-xs text-muted-foreground">(مثبّت على حسابك)</span>
                    </p>
                ) : (
                    <select
                        value={branchId}
                        disabled={sending || groups.some(g => !!g.payload)}
                        onChange={(e) => {
                            setBranchId(e.target.value);
                            // تغيير الفرع يغيّر نطاق الأسعار — تُعاد المقارنة (§190).
                            setStage('BUILD');
                            setGroups([]);
                            if (lines.length > 0) fetchComparisons(lines);
                        }}
                        className="w-full max-w-sm rounded-lg border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="">— اختر الفرع —</option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {stage === 'BUILD' ? (
                <>
                    <div className="rounded-xl border border-border bg-card p-4 print:hidden">
                        <h2 className="mb-3 text-sm font-bold text-foreground">أضف ما تحتاجه</h2>
                        <DrugSearchBox onPick={addDrug} disabled={!branchId || !!recoveryError} />
                        {!branchId && (
                            <p className="mt-2 text-xs text-amber-600">اختر فرع الاستلام أولاً.</p>
                        )}
                    </div>

                    {lines.length > 0 && (
                        <div className="rounded-xl border border-border bg-card">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                                    <ShoppingCart className="h-4 w-4" /> قائمة الاحتياج ({lines.length})
                                </h2>
                                {loadingPrices && (
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري جلب الأسعار…
                                    </span>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/40 text-right text-xs text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-2.5 font-medium">الدواء</th>
                                            <th className="px-4 py-2.5 font-medium">الكمية</th>
                                            <th className="px-4 py-2.5 font-medium">أقل آخر سعر</th>
                                            <th className="px-4 py-2.5 font-medium">المورد / جهة الطلب</th>
                                            <th className="px-4 py-2.5 font-medium">تاريخ السعر</th>
                                            <th className="px-4 py-2.5 font-medium">الإجمالي</th>
                                            <th className="px-4 py-2.5 font-medium">الحالة</th>
                                            <th className="px-4 py-2.5"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((l) => {
                                            const opt = selectedOption(l);
                                            const cheapestOrderable = l.comparison?.cheapestOrderable ?? null;
                                            const showAlternative =
                                                opt && !opt.orderable && cheapestOrderable && cheapestOrderable.supplierId !== opt.supplierId;
                                            // §302: opt.price سعر شريط دوماً (لا يتغيّر هنا — priceDrift في
                                            // types.ts يقارنه بـchosenPriceAtSelection). السعر المعروض هنا
                                            // وحده يتحوّل إلى سعر الباكيت حين تُعرَف التعبئة، مع وسم صريح.
                                            const linePrice = opt?.comparable ? resolveLinePrice(opt.price, l.unitsPerPack) : null;
                                            const lineTotal = linePrice && linePrice.amount !== null ? linePrice.amount * l.quantity : null;
                                            const priceOptions = l.comparison?.options ?? [];
                                            const isExpanded = expandedRows.includes(l.drugId);
                                            // فهرس أول خيار قابل للمقارنة = «الأرخص» (الخادم يُرتّبها
                                            // تصاعدياً ويُزيح غير المؤهّل للنهاية، §88/§90).
                                            const cheapestIndex = priceOptions.findIndex((o) => o.comparable);
                                            return (
                                                <Fragment key={l.drugId}>
                                                <tr
                                                    ref={(el) => { rowRefs.current[l.drugId] = el; }}
                                                    className="border-t border-border transition-shadow"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-foreground">{l.tradeName}</div>
                                                        <div className="font-mono text-[11px] text-muted-foreground">
                                                            {l.barcode || 'بلا باركود'}
                                                        </div>
                                                        {l.inInventory === false ? (
                                                            <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                                جديد — ليس في مخزونك
                                                            </span>
                                                        ) : l.currentStock === 0 && (
                                                            <span className="mt-1 inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                                                                نفد من المخزون
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            value={l.quantity}
                                                            onChange={(e) => setQuantity(l.drugId, e.target.value)}
                                                            className="w-20 rounded border border-border bg-muted px-2 py-1 text-center tabular-nums"
                                                        />
                                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                            {opt?.unitLabel ?? 'وحدة المخزون'}
                                                        </div>
                                                        {/* التعبئة: توثيق دائم بدل تأشيرة تنتهي بانتهاء الطلب.
                                                            حفظ العدد يرفع عدم الأهلية عن كل أسعار هذا الدواء دفعة
                                                            واحدة، ويُظهِر سعر الباكيت الذي يسعّر به المذخر فعلاً. */}
                                                        {/* لا تُرسم اللوحة قبل وصول المقارنة: unitsPerPack يصل معها،
                                                            وغيابه قبلها يعني «لم يصل الجواب» لا «غير موثّق». الخلط بينهما
                                                            كان يُومِض تحذير «غير موثّقة» ثم يستبدله بـ«الباكيت: N شريط»،
                                                            وتحذير يظهر ثم يختفي يُفقِد التحذيرات كلّها مصداقيتها.
                                                            ينطبق أيضاً على إعادة الجلب بعد «توثيق»: لا تعود اللوحة لحظةً. */}
                                                        {!l.comparison ? null : l.unitsPerPack ? (
                                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                                الباكيت: <b className="text-foreground">{l.unitsPerPack}</b> شريط
                                                            </div>
                                                        ) : (
                                                            <div className="mt-1 max-w-48 rounded-md border border-warning/40 bg-warning/5 p-1.5">
                                                                <p className="text-[11px] font-bold text-warning">
                                                                    ⚠ تعبئة هذا الدواء غير موثّقة
                                                                </p>
                                                                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                                                                    اكتب عدد أشرطة الباكيت ليُحسَب سعر الباكيت وتصير الأسعار
                                                                    قابلة للمقارنة والاختيار. يُحفظ مرة واحدة.
                                                                </p>
                                                                <div className="mt-1 flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        step={1}
                                                                        value={packDraft[l.drugId] ?? ''}
                                                                        onChange={(e) => setPackDraft(p => ({ ...p, [l.drugId]: e.target.value }))}
                                                                        placeholder="العدد"
                                                                        className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-center text-xs tabular-nums"
                                                                    />
                                                                    <button
                                                                        onClick={() => savePackUnits(l.drugId)}
                                                                        disabled={savingPack === l.drugId}
                                                                        className="rounded bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                                    >
                                                                        {savingPack === l.drugId ? '…' : 'توثيق'}
                                                                    </button>
                                                                </div>
                                                                <label className="mt-1 block text-[10px] text-muted-foreground">
                                                                    <input type="checkbox" checked={!!l.unitConfirmed} onChange={e => confirmUnit(l.drugId, e.target.checked)} />{' '}
                                                                    لهذا الطلب فقط: راجعتُ الأسعار ووحدتها
                                                                </label>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col items-start gap-1.5">
                                                            <div className="min-h-5">
                                                                {!l.comparison ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                                                ) : linePrice && linePrice.amount !== null ? (
                                                                    <span className="inline-flex flex-col items-start gap-0.5">
                                                                        <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/60 px-2 py-1 font-bold tabular-nums text-foreground">
                                                                            <span>{formatIQD(linePrice.amount)}</span>
                                                                            <span className="text-[10px] font-medium text-muted-foreground">د.ع</span>
                                                                        </span>
                                                                        {/* الوسم لا يغيب أبداً: باكيت (مشتق) أو شريط (كما هو) —
                                                                            هذا هو الخلل المُصلَح، أن تظهر الوحدتان بلا تمييز. */}
                                                                        <span className="text-[10px] text-muted-foreground">{linePrice.label}</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">لا يوجد سعر مؤهل — راجع المقارنة والوحدة</span>
                                                                )}
                                                            </div>
                                                            {priceOptions.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpanded(l.drugId)}
                                                                    aria-expanded={isExpanded}
                                                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold transition-colors ${
                                                                        isExpanded
                                                                            ? 'border-primary bg-primary text-primary-foreground'
                                                                            : 'border-primary/25 bg-primary/5 text-primary hover:bg-primary/10'
                                                                    }`}
                                                                >
                                                                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                                                                    <span>عرض الموردين</span>
                                                                    <span className={`min-w-5 rounded-full px-1 text-center tabular-nums ${isExpanded ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                                                                        {priceOptions.length}
                                                                    </span>
                                                                    <ChevronDown
                                                                        className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
                                                                        aria-hidden="true"
                                                                    />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {/* صنف بلا سعر مؤهل: لا يوجد «مورد مختار» بعد — تُختار جهة الطلب:
                                                            مذخر على المنصة (طلب تسعير إلكتروني §81) أو مورد محلي (طلب يدوي). */}
                                                        {!opt?.comparable || targetPickerOpen.has(l.drugId) ? (
                                                            <>
                                                                <div className="mb-1 text-[11px] text-muted-foreground">
                                                                    {opt?.comparable
                                                                        ? 'اختر جهة الطلب (أي مذخر أو مورد، ولو بلا سعر سابق):'
                                                                        : 'لا يوجد مورد بسعر — اختر جهة الطلب:'}
                                                                </div>
                                                                <select
                                                                    value={currentTargetValue(l)}
                                                                    onChange={(e) => chooseTarget(l.drugId, e.target.value)}
                                                                    className="w-48 rounded border border-border bg-muted px-2 py-1 text-xs"
                                                                >
                                                                    <option value="">— اختر جهة الطلب —</option>
                                                                    {l.barcode?.trim() && warehouseSections.related.length > 0 && (
                                                                        <optgroup label="مذاخر تتعامل معها (طلب إلكتروني)">
                                                                            {warehouseSections.related.map((w) => (
                                                                                <option key={w.id} value={encodeOrderTarget({ kind: 'warehouse', id: w.id })}>
                                                                                    {w.name}{w.linkedSupplier ? ` — مورِدك: ${w.linkedSupplier.name}` : ''}
                                                                                </option>
                                                                            ))}
                                                                        </optgroup>
                                                                    )}
                                                                    {l.barcode?.trim() && warehouseSections.others.length > 0 && (
                                                                        <optgroup label="مذاخر أخرى على المنصة (طلب تسعير)">
                                                                            {warehouseSections.others.map((w) => (
                                                                                <option key={w.id} value={encodeOrderTarget({ kind: 'warehouse', id: w.id })}>
                                                                                    {w.name}{w.city ? ` — ${w.city}` : ''}
                                                                                </option>
                                                                            ))}
                                                                        </optgroup>
                                                                    )}
                                                                    {manualSuppliers.length > 0 && (
                                                                        <optgroup label="موردوك غير المربوطين (طلب يدوي)">
                                                                            {manualSuppliers.map((s) => (
                                                                                <option key={s.id} value={encodeOrderTarget({ kind: 'supplier', id: s.id })}>
                                                                                    {s.name}
                                                                                </option>
                                                                            ))}
                                                                        </optgroup>
                                                                    )}
                                                                </select>
                                                                {l.manualSupplierId && (
                                                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                                                        يُضاف إلى قائمة الطلب اليدوي المطبوعة — لا يُرسل إلكترونياً.
                                                                    </div>
                                                                )}
                                                                {/* طريق عودة: من فتح المنتقي ثم عدَل عن التغيير يعود للجهة
                                                                    المشتقّة من السعر بلا أن يعيد تحميل الصفحة. */}
                                                                {opt?.comparable && targetPickerOpen.has(l.drugId) && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            chooseTarget(l.drugId, '');
                                                                            toggleTargetPicker(l.drugId);
                                                                        }}
                                                                        className="mt-1 block text-[11px] text-muted-foreground hover:underline"
                                                                    >
                                                                        إلغاء والعودة إلى الأرخص
                                                                    </button>
                                                                )}
                                                                {(() => {
                                                                    // تحذير المورد المكرر لحظة اختيار المذخر، قبل الوصول للمراجعة.
                                                                    const wh = l.manualWarehouseId ? warehouses.find((w) => w.id === l.manualWarehouseId) : null;
                                                                    if (!wh || wh.linkedSupplier || !wh.possibleDuplicates?.length) return null;
                                                                    return (
                                                                        <div className="mt-1 flex max-w-56 items-start gap-1 text-[11px] text-amber-600">
                                                                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                                            <span>
                                                                                قد يكون نفس مورِدك «{wh.possibleDuplicates.map((d) => d.supplierName).join('» أو «')}». اطلب ربطه أولاً من صفحة الموردين.
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="text-xs text-foreground">{opt?.supplierName ?? '—'}</div>
                                                                {/* أداة القرار متاحة دائماً لا عند غياب السعر فقط. */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleTargetPicker(l.drugId)}
                                                                    className="mt-1 block text-[11px] text-primary hover:underline"
                                                                >
                                                                    تغيير جهة الطلب
                                                                </button>
                                                            </>
                                                        )}
                                                        {opt?.warehouseName && (
                                                            <div className="text-[11px] text-primary">{opt.warehouseName}</div>
                                                        )}
                                                        {(() => {
                                                            // §79: تغيّر سعر خيار اختاره المستخدم يدوياً يُعرَض ولا يُبتلع.
                                                            // §302: القيمتان بنفس الوحدة دوماً (كلتاهما تمرّان بنفس l.unitsPerPack)،
                                                            // فتحويلهما معاً لا يُغيّر معنى الفرق، ويُبقيه متّسقاً مع الشريحة أعلاه.
                                                            const drift = priceDrift(l);
                                                            if (!drift) return null;
                                                            const from = resolveLinePrice(drift.from, l.unitsPerPack);
                                                            const to = resolveLinePrice(drift.to, l.unitsPerPack);
                                                            return (
                                                                <button
                                                                    onClick={() => acknowledgeDrift(l.drugId)}
                                                                    className="mt-1 block text-right text-[11px] text-amber-600 hover:underline"
                                                                    title="اضغط لقبول السعر الجديد"
                                                                >
                                                                    تغيّر السعر: {formatIQD(from.amount!)} ← {formatIQD(to.amount!)} ({to.label})
                                                                </button>
                                                            );
                                                        })()}
                                                        {showAlternative && (() => {
                                                            // §302: خيار مورد آخر لنفس الدواء — نفس التعبئة، فيُحسب ويُوسَم
                                                            // بنفس القاعدة كي لا يتعارض ظاهرياً مع السعر الموسوم أعلاه.
                                                            const alt = resolveLinePrice(cheapestOrderable!.price, l.unitsPerPack);
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => chooseSupplier(l.drugId, cheapestOrderable!.supplierId)}
                                                                    className="mt-1 block max-w-56 rounded-md bg-primary px-2 py-1 text-right text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                                                                >
                                                                    أرخص قابل للإرسال: {cheapestOrderable!.supplierName} (
                                                                    {alt.amount !== null ? `${formatIQD(alt.amount)} ${alt.label}` : '—'})
                                                                </button>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                                        {formatDate(opt?.recordedAt ?? null)}
                                                        {opt?.isStale && (
                                                            <span className="mr-1 text-amber-600">· قديم</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 tabular-nums text-foreground">
                                                        {lineTotal !== null ? formatIQD(lineTotal) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {l.manualSupplierId ? (
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">طلب يدوي</span>
                                                        ) : (!l.barcode?.trim() || l.orderability === 'AMBIGUOUS_BARCODE') ? (
                                                            /* مانعا الهوية الوحيدان بعد أن صار الخادم يُنشئ الصفّ
                                                               المشترك عند أول إرسال: بلا باركود، أو مطابقة غامضة. */
                                                            <div className="max-w-56">
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                                                                    <AlertTriangle className="h-3 w-3" /> غير قابل للإرسال إلكترونياً
                                                                </span>
                                                                {l.orderabilityReason && (
                                                                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                                                                        {l.orderabilityReason}
                                                                    </p>
                                                                )}
                                                                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                                                                    يمكنك طلبه <b className="text-foreground">يدوياً</b> باختيار جهة الطلب من عمود المورد،
                                                                    فيظهر في قائمة الطباعة والواتساب.
                                                                </p>
                                                            </div>
                                                        ) : (l.manualWarehouseId || opt?.orderable) ? (
                                                            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">{l.manualWarehouseId ? 'جاهز لطلب التسعير' : 'جاهز'}</span>
                                                        ) : (
                                                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">
                                                                {opt ? 'مورده غير مربوط — طلب يدوي' : 'اختر جهة الطلب'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setCompareLine(l.drugId)}
                                                                disabled={!l.comparison}
                                                                className="rounded-md p-1.5 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                                                                title="مقارنة الأسعار"
                                                            >
                                                                <BarChart3 className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => removeLine(l.drugId)}
                                                                className="rounded-md p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                                title="حذف"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="border-t border-border bg-muted/20">
                                                        {/* ثمانية أعمدة في الترويسة — أي تغيير فيها يلزمه تعديل colSpan. */}
                                                        <td colSpan={8} className="px-3 py-3 sm:px-4">
                                                            <div className="rounded-lg border border-primary/15 bg-primary/5 p-2.5 sm:p-3">
                                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                                    <span className="text-xs font-bold text-foreground">عروض الموردين</span>
                                                                    <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                                                                        {priceOptions.length} خيارات متاحة
                                                                    </span>
                                                                </div>
                                                                <div className="grid gap-2 sm:grid-cols-2">
                                                                {priceOptions.map((o, i) => {
                                                                    const isChosen = !!opt && opt.supplierId === o.supplierId;
                                                                    return (
                                                                        <div
                                                                            key={o.supplierId || 'unattributed'}
                                                                            className={`rounded-lg border px-2.5 py-2 text-xs ${isChosen ? 'border-primary/40 bg-card shadow-sm' : 'border-border bg-card'}`}
                                                                        >
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <div className="min-w-0">
                                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                                        <span className="truncate font-semibold text-foreground">{o.supplierName}</span>
                                                                                        {i === cheapestIndex && (
                                                                                            <span className="shrink-0 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                                                                                                الأرخص
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="mt-1 truncate text-[10px] text-muted-foreground">
                                                                                        {o.warehouseName ? <span className="text-primary">{o.warehouseName}</span> : 'غير مربوط بمذخر'}
                                                                                        <span className="mx-1">·</span>
                                                                                        {formatDate(o.recordedAt)}
                                                                                        {o.isStale && <span className="text-amber-600"> · قديم</span>}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="shrink-0 text-left">
                                                                                    <div className="font-bold tabular-nums text-foreground">
                                                                                        {o.price !== null ? `${formatIQD(o.price)} د.ع` : '—'}
                                                                                    </div>
                                                                                    <div className="text-[10px] text-muted-foreground">لكل {o.unitLabel}</div>
                                                                                    {/* §302: نفس السطر الإضافي في PriceCompareModal — بلا هذا
                                                                                        السطر كانت هذه البطاقة (لمورد قد يكون هو نفسه المعروض في
                                                                                        الشريحة أعلاه) تُظهر سعر الشريط وحده، فيتعارض ظاهرياً مع
                                                                                        سعر الباكيت الموسوم هناك لنفس المورد. */}
                                                                                    {(() => {
                                                                                        const packet = o.price !== null ? toPacketPrice(o.price, l.unitsPerPack) : null;
                                                                                        if (packet === null) return null;
                                                                                        return (
                                                                                            <div className="text-[10px] text-muted-foreground">
                                                                                                الباكيت ({l.unitsPerPack}): <b className="text-foreground">{formatIQD(packet)}</b>
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                            </div>
                                                                            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-1.5">
                                                                                {o.qualityReason ? (
                                                                                    <span className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] font-semibold text-amber-600" title={QUALITY_LABEL[o.qualityReason]}>
                                                                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                                                                        غير مؤهل: {QUALITY_LABEL[o.qualityReason]}
                                                                                    </span>
                                                                                ) : isChosen ? (
                                                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                                                                                        <Check className="h-3 w-3" /> مختار
                                                                                    </span>
                                                                                ) : o.comparable && o.supplierId ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => chooseSupplier(l.drugId, o.supplierId)}
                                                                                        className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                                                                                    >
                                                                                        اختر هذا السعر
                                                                                    </button>
                                                                                ) : (
                                                                                    <span className="text-[10px] text-muted-foreground">غير مؤهل للاختيار</span>
                                                                                )}
                                                                                {o.qualityReason && (
                                                                                    <span className="truncate text-[10px] text-muted-foreground" title={QUALITY_FIX[o.qualityReason]}>
                                                                                        راجع السبب
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {o.qualityReason && (
                                                                                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{QUALITY_FIX[o.qualityReason]}</p>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCompareLine(l.drugId)}
                                                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                                                >
                                                                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                                                                    السجل الكامل والمصادر
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                                <div className="text-sm">
                                    <span className="text-muted-foreground">إجمالي الأصناف المسعّرة تقديرياً: </span>
                                    <b className="tabular-nums text-foreground">{formatIQD(totals.total)} د.ع</b>
                                    {totals.unpriced > 0 && (
                                        <span className="mr-2 text-xs text-amber-600">
                                            (+{totals.unpriced} صنف بلا سعر مسجّل)
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={enterReview}
                                    disabled={lines.length === 0 || !branchId || loadingPrices || lines.some(l => !l.comparison) || !!recoveryError}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                    مراجعة الطلب
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {disclaimer && lines.length > 0 && (
                        <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground print:hidden">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {disclaimer}
                        </p>
                    )}
                </>
            ) : (
                <ReviewStage
                    groups={groups}
                    blocked={classified.blocked}
                    notes={notes}
                    setNotes={setNotes}
                    oversize={oversize}
                    remaining={remaining}
                    submitBlockedReason={submitVerdict.ok ? null : submitVerdict.reason ?? null}
                    warehouses={warehouses}
                    duplicateConfirmed={duplicateConfirmed}
                    onConfirmDuplicate={(id, v) => setDuplicateConfirmed((prev) => ({ ...prev, [id]: v }))}
                    unconfirmedDuplicates={unconfirmedDuplicates.length}
                    sending={sending}
                    onBack={() => { if (!sending && !groups.some(g => g.payload)) setStage('BUILD'); }}
                    onNew={startNew}
                    recoveryBlocked={!!recoveryError}
                    onSubmit={submitAll}
                    onPrint={printManual}
                />
            )}

            {activeLine && (
                <PriceCompareModal
                    line={activeLine}
                    contextBranchId={branchId || null}
                    onChoose={(supplierId) => chooseSupplier(activeLine.drugId, supplierId)}
                    onClose={() => setCompareLine(null)}
                />
            )}
        </div>
    );
}

// ── شاشة المراجعة والإرسال ───────────────────────────────────────────────────
function ReviewStage({
    groups, blocked, notes, setNotes, oversize, remaining, submitBlockedReason, sending, onBack, onSubmit, onPrint, onNew, recoveryBlocked,
    warehouses, duplicateConfirmed, onConfirmDuplicate, unconfirmedDuplicates,
}: {
    groups: SendGroup[];
    blocked: BlockedLine[];
    warehouses: ActiveWarehouse[];
    duplicateConfirmed: Record<string, boolean>;
    onConfirmDuplicate: (warehouseId: string, confirmed: boolean) => void;
    unconfirmedDuplicates: number;
    notes: Record<string, string>;
    setNotes: (n: Record<string, string>) => void;
    oversize: SendGroup[];
    remaining: number;
    submitBlockedReason: string | null;
    sending: boolean;
    onBack: () => void;
    onNew: () => void;
    recoveryBlocked: boolean;
    onSubmit: () => void;
    onPrint: () => void;
}) {
    const anySent = groups.some((g) => g.status === 'SENT');
    const blockedGroups = groupBlockedBySupplier(blocked);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <button disabled={sending || groups.some(g => !!g.payload)} onClick={onBack} className="text-sm text-primary hover:underline">
                    ← تعديل القائمة
                </button>
                <div className="text-sm text-muted-foreground">
                    {groups.length} طلب إلكتروني · {blocked.length} صنف خارجها
                </div>
            </div>

            {oversize.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive print:hidden">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {submitBlockedReason} احذف أصنافاً قبل الإرسال؛ لن يُقسّم المذخر الواحد
                        تلقائياً إلى طلبين.
                    </span>
                </div>
            )}

            {groups.map((g) => (
                <div key={g.warehouseId} className="rounded-xl border border-border bg-card print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 font-bold text-foreground">
                                <Building2 className="h-4 w-4 text-primary" />
                                {g.warehouseName}
                            </h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                عبر المورد: {g.supplierNames.join('، ')} · {g.lines.length} صنف
                            </p>
                        </div>
                        <GroupBadge group={g} />
                    </div>

                    {(() => {
                        // مذخر بلا مورد مربوط ويشبه مورداً محلياً: أول اعتماد سيُنشئ مورداً ثانياً.
                        const wh = warehouses.find((w) => w.id === g.warehouseId);
                        if (g.status === 'SENT' || !wh || wh.linkedSupplier || !wh.possibleDuplicates?.length) return null;
                        return (
                            <div className="border-b border-border bg-amber-500/5 px-4 py-3 text-xs">
                                <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-500">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>
                                        هذا المذخر غير مربوط بأي مورد لديك، ويشبه
                                        {' '}«{wh.possibleDuplicates.map((d) => `${d.supplierName}${d.reason === 'PHONE' ? ' (نفس الهاتف)' : ''}`).join('»، «')}».
                                        إن كان نفس الجهة فأرسل طلب ربط من صفحة الموردين وانتظر الموافقة قبل الطلب؛ وإلا سيُنشأ
                                        عند الاعتماد مورد جديد منفصل وينقسم الرصيد والفواتير بين سجلين.
                                    </span>
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <label className="flex items-center gap-1.5 text-foreground">
                                        <input
                                            type="checkbox"
                                            checked={!!duplicateConfirmed[g.warehouseId]}
                                            disabled={sending || !!g.payload}
                                            onChange={(e) => onConfirmDuplicate(g.warehouseId, e.target.checked)}
                                        />
                                        تأكدت أنه جهة مختلفة — أرسل الطلب
                                    </label>
                                    <Link href="/dashboard/suppliers" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        فتح صفحة الموردين
                                    </Link>
                                </div>
                            </div>
                        );
                    })()}

                    <table className="min-w-full text-sm">
                        <tbody>
                            {g.lines.map((l) => {
                                return (
                                    <tr key={l.drugId} className="border-b border-border last:border-0">
                                        <td className="px-4 py-2.5">
                                            <div className="text-foreground">{l.tradeName}</div>
                                            <div className="font-mono text-[11px] text-muted-foreground">{l.barcode}</div>
                                        </td>
                                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">×{l.quantity}</td>
                                        <td className="px-4 py-2.5 text-left tabular-nums text-foreground">
                                            {l.unitPrice !== null ? `${formatIQD(l.unitPrice)} د.ع` : 'بلا سعر متوقع'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="border-t border-border px-4 py-3 print:hidden">
                        <textarea
                            value={notes[g.warehouseId] ?? ''}
                            onChange={(e) => setNotes({ ...notes, [g.warehouseId]: e.target.value })}
                            disabled={sending || !!g.payload}
                            rows={2}
                            placeholder="ملاحظات لهذا المذخر (اختياري)"
                            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm disabled:opacity-60"
                        />
                        {g.error && (
                            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {g.error}
                            </p>
                        )}
                    </div>
                </div>
            ))}

            {/* الأصناف غير القابلة للإرسال — تبقى ظاهرة ولا تُسقَط بصمت (§99) */}
            {blocked.length > 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card">
                    <div className="border-b border-border px-4 py-3">
                        <h3 className="font-bold text-foreground">أصناف لم تُرسل إلكترونياً ({blocked.length})</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            اطبع هذه القائمة وأرسل كل قسم لمورده يدوياً. لا يُنشأ لها طلب ولا فاتورة ولا دين.
                        </p>
                    </div>
                    {blockedGroups.map((bg) => (
                        <div key={bg.supplierName} className="border-b border-border last:border-0">
                            <h4 className="flex items-center justify-between bg-muted/40 px-4 py-2 text-xs font-bold text-foreground">
                                <span>{bg.supplierName}</span>
                                <span className="font-normal text-muted-foreground">{bg.items.length} صنف</span>
                            </h4>
                            <table className="min-w-full text-sm">
                                <tbody>
                                    {bg.items.map((b) => (
                                        <tr key={b.line.drugId} className="border-t border-border">
                                            <td className="px-4 py-2.5">
                                                <div className="text-foreground">{b.line.tradeName}</div>
                                                <div className="font-mono text-[11px] text-muted-foreground">{b.line.barcode}</div>
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">×{b.line.quantity}</td>
                                            <td className="px-4 py-2.5 text-[11px] text-amber-600">{b.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                    <div className="border-t border-border px-4 py-3 print:hidden">
                        <button
                            onClick={onPrint}
                            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted"
                        >
                            <Printer className="h-3.5 w-3.5" />
                            طباعة قائمة الطلب اليدوي
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 print:hidden">
                <p className="text-sm text-muted-foreground">
                    سيُرسَل <b className="text-foreground">{remaining}</b> طلب إلكتروني
                    {blocked.length > 0 && <> · <b className="text-foreground">{blocked.length}</b> صنف يبقى خارجها</>}
                </p>
                <div className="flex items-center gap-3">
                    {groups.length > 0 && !groups.some(g => g.status === 'UNKNOWN' || g.status === 'SENDING' || g.hasUncertainOutcome) && <button disabled={sending || recoveryBlocked} onClick={onNew} className="text-sm text-primary">{groups.some(g => g.status !== 'SENT') || blocked.length ? 'تعديل الأصناف غير المرسلة' : 'بدء قائمة جديدة'}</button>}
                    {anySent && (
                        <Link
                            href="/dashboard/purchases/warehouse-orders"
                            className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
                        >
                            متابعة الطلبات
                        </Link>
                    )}
                    <button
                        onClick={onSubmit}
                        disabled={sending || recoveryBlocked || remaining === 0 || oversize.length > 0 || unconfirmedDuplicates > 0}
                        title={unconfirmedDuplicates > 0 ? 'أكّد تحذير المورد المكرر في المجموعات المعلَّمة أولاً' : undefined}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                        {remaining === 0 ? 'أُرسلت كل الطلبات' : sending ? 'جاري الإرسال…' : 'إرسال الطلبات'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function GroupBadge({ group }: { group: SendGroup }) {
    if (group.status === 'SENT') {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                <Check className="h-3.5 w-3.5" />
                أُرسل {group.orderNumber ?? ''}
            </span>
        );
    }
    if (group.status === 'SENDING') {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري الإرسال
            </span>
        );
    }
    if (group.status === 'FAILED') {
        return <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">فشل</span>;
    }
    if (group.status === 'UNKNOWN') {
        return <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600">نتيجة غير مؤكدة</span>;
    }
    return <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">لم يُرسل</span>;
}
