'use client';

import { getPurchaseDetails, receivePurchase } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use, Fragment } from 'react';
import { Toaster, toast } from 'sonner';

export default function ReceivePurchasePage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [purchase, setPurchase] = useState<any>(null);
    const [receivedItems, setReceivedItems] = useState<any>({});
    const [isPaid, setIsPaid] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        getPurchaseDetails(params.id).then((data) => {
            if (data) {
                setPurchase(data);
                const initial: any = {};
                data.items.forEach((item: any) => {
                    // اقتراح المذخر: SINGLE فقط يُصلح للتعبئة التلقائية — دفعة
                    // واحدة مؤكَّدة شُحنت فعلياً. MULTIPLE يعني أن الشحنة خُصِّصت
                    // من أكثر من دفعة (FEFO)، فلا رقم واحد يمثّلها بصدق.
                    const single = item.shippedPrefill?.kind === 'SINGLE' ? item.shippedPrefill : null;
                    const isMultipleShipment = item.shippedPrefill?.kind === 'MULTIPLE';
                    // فارغان عمداً حين لا مصدر موثوق. كانت الشاشة تولّد
                    // `BAT-<تاريخ اليوم>-<رقم>` وتاريخ انتهاء = اليوم + سنة، فمن
                    // يضغط «تأكيد» بلا تعديل يكتب تاريخ صلاحية **مُختلَقاً** في
                    // Batch.expiryDate — وهو الحقل الذي يعتمده الصرف (أول منتهٍ
                    // أول مصروف) وتقرير المنتهية. والاختلاق كان يمرّ من حارس
                    // الخادم بلا اعتراض لأن «اليوم + سنة» تاريخ مستقبلي صالح شكلاً.
                    //
                    // الأولوية الآن (الأصدق أولاً)، لكل حقل على حدة:
                    //  1) shippedPrefill.kind === 'SINGLE' — ما شحنه المذخر فعلياً
                    //     بتخصيص FEFO مؤكَّد. الحقيقة الفعلية.
                    //  2) shippedPrefill.kind === 'MULTIPLE' — نمتنع صراحةً هنا،
                    //     حتى لو صرّح المذخر برقم عند التسعير: تعدد الدفعات
                    //     المصدر يثبت أن رقماً واحداً مصرَّحاً خطأ لبعض الوحدات
                    //     على الأقل، فلا يصح عرضه كأنه موثوق (انظر القائمة
                    //     المعروضة أدناه لكل ما شُحن فعلاً بدل ذلك).
                    //  3) ما سجّلته فاتورة الشراء نفسها (PurchaseItem.batchNumber/
                    //     expiryDate) — تصريح المذخر وقت التسعير، وعدٌ قبل انتقاء
                    //     البضاعة فعلاً لا إثبات شحن (انظر تعليق العمودين في
                    //     schema.prisma وWarehouseOrderItem.batchNumber).
                    //  4) فارغ ينتظر الفاتورة الورقية في يد الصيدلاني. لا تخمين قط.
                    initial[item.id] = {
                        quantity: item.quantity,
                        expiryDate: single
                            ? format(new Date(single.expiryDate), 'yyyy-MM-dd')
                            : isMultipleShipment
                                ? ''
                                : (item.expiryDate ? format(new Date(item.expiryDate), 'yyyy-MM-dd') : ''),
                        // || لا ?? عمداً: PurchaseItem.batchNumber عمودٌ نصّي قابل لأن
                        // يكون '' لا فقط null (نفس منطق expiryDate أعلاه بمعادلها
                        // الرقمي) — '' فارغ فعلياً ويجب أن يسقط للخطوة التالية أيضاً،
                        // لا أن يُعامَل كقيمة "موجودة" تُسكت البديل بصمت.
                        batchNumber: single
                            ? single.batchNumber
                            : isMultipleShipment
                                ? ''
                                : (item.batchNumber || ''),
                    };
                });
                setReceivedItems(initial);
            }
            setLoading(false);
        });
    }, [params.id]);

    // بنود ينقصها رقم الدفعة أو تاريخ انتهاء صالح — تمنع الإرسال وتُعلَّم بصرياً.
    const isLineIncomplete = (itemId: string) => {
        const d = receivedItems[itemId];
        if (!d) return true;
        if (!String(d.batchNumber ?? '').trim()) return true;
        const exp = d.expiryDate ? new Date(d.expiryDate) : null;
        return !exp || !Number.isFinite(exp.getTime()) || exp <= new Date();
    };
    const incompleteCount = purchase
        ? purchase.items.filter((it: any) => isLineIncomplete(it.id)).length
        : 0;

    const handleConfirm = async () => {
        if (submitting) return;
        // حارس ثانٍ بعد تعطيل الزر: لا رقم دفعة مُولَّداً ولا تاريخ افتراضياً هنا —
        // البند الناقص يوقف الاستلام بدل أن يُملأ بقيمة مُختلَقة.
        if (incompleteCount > 0) {
            toast.error(`أكمل رقم الدفعة وتاريخ الانتهاء لـ${incompleteCount} بنداً قبل الاستلام.`);
            return;
        }
        setSubmitting(true);
        try {
            const itemsToSubmit = Object.entries(receivedItems).map(([itemId, data]: [string, any]) => ({
                itemId,
                quantity: Number(data.quantity),
                expiryDate: new Date(data.expiryDate),
                batchNumber: String(data.batchNumber).trim(),
            }));

            await receivePurchase(params.id, itemsToSubmit, isPaid);
            toast.success('تم استلام الطلب وإضافة الأدوية إلى الدفعات والمخزون');
            // القادم من «طلبات المذاخر» يعود إليها ليرى حالة «استُلمت» — قيمة ثابتة لا مسار حر.
            const fromWarehouseOrders = new URLSearchParams(window.location.search).get('return') === 'warehouse-orders';
            router.push(fromWarehouseOrders ? '/dashboard/purchases/warehouse-orders' : '/dashboard/purchases');
            router.refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء الاستلام');
            console.error(error);
            setLoading(false);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="p-6 space-y-6" dir="rtl">
            <div className="h-8 w-1/3 bg-muted animate-pulse rounded-md"></div>
            <div className="bg-card rounded-lg shadow overflow-hidden border">
                <div className="h-12 bg-muted/50 border-b animate-pulse"></div>
                <div className="p-4 space-y-4">
                    {[1, 2, 3].map((i: any) => (
                        <div key={i} className="flex gap-4">
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
    if (!purchase) return <div>الطلب غير موجود</div>;
    if (purchase.status !== 'PENDING') return <div>هذا الطلب تم استلامه مسبقاً</div>;

    return (
        <div className="p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold">استلام مواد الطلب #{purchase.id.slice(0, 8)}</h1>

            <div className="bg-card rounded-lg shadow overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">المادة</TableHead>
                            <TableHead className="text-right w-[150px]">الكمية المستلمة</TableHead>
                            <TableHead className="text-right w-[200px]">رقم العمل (Batch)</TableHead>
                            <TableHead className="text-right w-[200px]">تاريخ الانتهاء</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {purchase.items.map((item: any) => {
                            const prefill = item.shippedPrefill;
                            const single = prefill?.kind === 'SINGLE' ? prefill : null;
                            const isMultipleShipment = prefill?.kind === 'MULTIPLE';
                            // بوابة "وعد المذخر": فاتورة مورّد عادية (لا صلة بمذخر
                            // إطلاقاً) قد يكون فيها PurchaseItem.batchNumber مملوءاً
                            // يدوياً من فاتورة ورقية — هذا ليس تصريح مذخر بأي حال،
                            // ونسبته لمذخر تكون ادّعاءً كاذباً أسوأ من العلامة العامة
                            // القديمة. warehouseId على المورد نفسه (لا shippedPrefill)
                            // هو الفحص الصحيح: يبقى ثابتاً بصرف النظر عن SINGLE/
                            // MULTIPLE/غياب أي شحن مسجَّل، ونفس الحقل الذي تشترطه
                            // getPurchaseDetails() قبل أن تحسب shippedPrefill أصلاً.
                            const isWarehouseLinked = !!purchase.supplier?.warehouseId;
                            // العلامة تظهر فقط حين قيمة الحقل الحالية هي فعلاً ما
                            // ملأه أحد المصدرين (لا ما كتبه الصيدلاني بنفسه)، كي
                            // تبقى صادقة بعد أي تعديل يدوي. مصدران بمصداقية مختلفة
                            // تماماً فلا يصح عرضهما بنفس الصياغة (انظر الأولوية في
                            // useEffect أعلاه):
                            //  - rowShippedActual: ما شحنه المذخر فعلياً بتخصيص
                            //    FEFO مؤكَّد (SINGLE) — الحقيقة الفعلية.
                            //  - rowQuotedPromise: ما وصل من بيانات التسعير
                            //    (PurchaseItem.batchNumber/expiryDate)، ولا SINGLE
                            //    ولا MULTIPLE هنا. الحقلان لم يعودا من نفس الطبيعة
                            //    (قرار صاحب النظام 2026-09): expiryDate يبقى تصريحاً
                            //    حقيقياً من المذخر وقت التسعير — وعدٌ لا إثبات شحن؛
                            //    batchNumber لم يعد شيئاً "صرّح به" المذخر إطلاقاً، بل
                            //    مرجع شحنة يُصدره النظام آلياً (buildShipmentRef في
                            //    app/lib/shipment-ref.ts) — ليس رقم دفعة حقيقياً من
                            //    مصنع ولا ادّعاءً من المذخر بأي شيء. النص المعروض أدناه
                            //    يعكس الفرق. مشروط بفاتورة مرتبطة بمذخر فعلاً
                            //    (isWarehouseLinked)، وإلا فهذه قيمة الصيدلاني نفسه من
                            //    فاتورة ورقية عادية.
                            const batchShippedActual = !!single &&
                                receivedItems[item.id]?.batchNumber === single.batchNumber;
                            const expiryShippedActual = !!single &&
                                receivedItems[item.id]?.expiryDate === format(new Date(single.expiryDate), 'yyyy-MM-dd');
                            const rowShippedActual = batchShippedActual || expiryShippedActual;

                            const batchQuotedPromise = isWarehouseLinked && !single && !isMultipleShipment && !!item.batchNumber &&
                                receivedItems[item.id]?.batchNumber === item.batchNumber;
                            const expiryQuotedPromise = isWarehouseLinked && !single && !isMultipleShipment && !!item.expiryDate &&
                                receivedItems[item.id]?.expiryDate === format(new Date(item.expiryDate), 'yyyy-MM-dd');
                            const rowQuotedPromise = batchQuotedPromise || expiryQuotedPromise;
                            return (
                                <Fragment key={item.id}>
                                    <TableRow>
                                        <TableCell className="font-medium">
                                            {item.drugName}
                                            {rowShippedActual && (
                                                <p className="text-xs text-muted-foreground font-normal mt-1">من شحنة المذخر الفعلية — تحقّق قبل التأكيد</p>
                                            )}
                                            {/* الجملتان مستقلتان عمداً (batchQuotedPromise/expiryQuotedPromise
                                                منفصلان أعلاه، وrowQuotedPromise = OR بينهما): الحقلان قد
                                                يصلان هذا الفرع منفردين لا معاً — مثلاً تاريخ انتهاء فارغ من
                                                المذخر (اختياري وقت التسعير) فيبقى batchQuotedPromise وحده
                                                صحيحاً، أو صيدلاني عدّل رقم الدفعة يدوياً بعد التعبئة الأولية
                                                فيبقى expiryQuotedPromise وحده صحيحاً. جملة واحدة تصف
                                                الحقلين معاً بصرف النظر عن الحالة كانت ستكذب على حقل لم
                                                يصله فعلاً — نفس الخطأ الذي يمنعه isWarehouseLinked أعلاه. */}
                                            {!rowShippedActual && rowQuotedPromise && (
                                                <p className="text-xs text-muted-foreground font-normal mt-1">
                                                    {batchQuotedPromise && 'رقم الدفعة مرجع أصدره النظام آلياً (لا رقم دفعة حقيقي)'}
                                                    {batchQuotedPromise && expiryQuotedPromise && '، '}
                                                    {expiryQuotedPromise && 'تاريخ الانتهاء تصريح المذخر عند التسعير (وعد لا إثبات شحن)'}
                                                    {' — تحقّق من العلبة قبل التأكيد'}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={receivedItems[item.id]?.quantity}
                                                onChange={(e) => setReceivedItems((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: Number(e.target.value) } }))}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                placeholder="كما هو مطبوع على العلبة"
                                                value={receivedItems[item.id]?.batchNumber ?? ''}
                                                aria-invalid={!String(receivedItems[item.id]?.batchNumber ?? '').trim()}
                                                className={!String(receivedItems[item.id]?.batchNumber ?? '').trim() ? 'border-destructive' : undefined}
                                                onChange={(e) => setReceivedItems((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], batchNumber: e.target.value } }))}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="date"
                                                value={receivedItems[item.id]?.expiryDate ?? ''}
                                                aria-invalid={!receivedItems[item.id]?.expiryDate}
                                                className={!receivedItems[item.id]?.expiryDate ? 'border-destructive' : undefined}
                                                onChange={(e) => setReceivedItems((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], expiryDate: e.target.value } }))}
                                            />
                                        </TableCell>
                                    </TableRow>
                                    {prefill?.kind === 'MULTIPLE' && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="bg-muted/40 rounded-md text-xs text-muted-foreground py-2">
                                                شُحن هذا الصنف من أكثر من دفعة عند المذخر، فلا يمكن اقتراح رقم أو تاريخ تلقائياً — اختر يدوياً بحسب العلب المستلمة فعلاً:{' '}
                                                {prefill.batches.map((b: any, i: number) => (
                                                    <span key={i}>
                                                        {i > 0 && '، '}
                                                        «{b.batchNumber}» ينتهي {format(new Date(b.expiryDate), 'yyyy-MM-dd')} (الكمية المشحونة {b.quantity})
                                                    </span>
                                                ))}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <div className="bg-card p-4 rounded-lg shadow flex items-center gap-2 mb-4">
                <input
                    type="checkbox"
                    id="paid"
                    className="w-5 h-5"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                />
                <label htmlFor="paid" className="font-bold cursor-pointer select-none">
                    تم الدفع نقداً (تسجيل مصروف بقيمة {purchase.total.toLocaleString()} د.ع)
                </label>
            </div>

            {incompleteCount > 0 && (
                <p className="text-sm text-destructive">
                    انقل رقم الدفعة وتاريخ الانتهاء من العلبة أو فاتورة المورّد — ينقص {incompleteCount} بنداً.
                    هذان الحقلان يحكمان ترتيب الصرف وتنبيه القرب من الانتهاء، فلا يصحّ تخمينهما.
                </p>
            )}

            <Button
                onClick={handleConfirm}
                disabled={submitting || incompleteCount > 0}
                className="w-full h-12 text-lg"
            >
                {submitting ? 'جارٍ الاستلام…' : 'تأكيد واستلام المواد'}
            </Button>
        </div>
    );
}
