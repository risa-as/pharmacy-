// المرحلة 5 من ميزة المذاخر (مُستخرَجة لاحقاً لدعم الاعتماد الآلي — انظر
// app/api/warehouse-portal/orders/[id]/quote/route.ts): جسر الاعتماد الكامل —
// من عرض المذخر (QUOTED) إلى فاتورة شراء مسودة + فاتورة مذخر (APPROVED).
//
// هذا الملف كان بالكامل داخل POST /api/warehouses/orders/[id] (مسار الصيدلية
// فقط). استُخرج هنا حرفياً (سلوك مطابق، بلا تغيير في الحسابات أو الرسائل) كي
// يستدعيه أيضاً مسار عرض السعر (app/api/warehouse-portal/orders/[id]/quote)
// عند الاعتماد الآلي — حين يطابق عرض المذخر طلب الصيدلية تماماً، فلا داعٍ
// لضغطة اعتماد بشرية (قرار صاحب النظام 2026-09). انظر shouldAutoApprove في
// warehouse-quote.ts لشرط الاعتماد الآلي.
//
// فارق جوهري عن الأصل: **لا يعتمد على tenantCtx إطلاقاً** — المصدر الوحيد
// للمنظمة الآن هو order.branch.organizationId (نفس ما كان فرع CREATE
// للمورد المرآة يفعله أصلاً وحده)، لأن هذه الدالة يجب أن تُستدعى أيضاً من
// بوابة المذخر حيث لا يوجد سياق صيدلية (لا مستخدم صيدلية، لا جلسة) عند
// الاعتماد الآلي. فرعا USE وCREATE في قرار المورد المرآة يستخدمان الآن نفس
// المصدر الواحد بدل أن يفترق أحدهما (USE) عن الآخر (CREATE).
//
// **لا يرمي استثناءً للرفض التجاري أبداً** — يُرجع ApprovalOutcome دائماً لهذه
// الحالات (PACK_UNITS_UNRESOLVED، ALL_ITEMS_OUT_OF_STOCK، فشل بناء الخطة،
// BLOCKED_NO_ORG، رفض ائتماني، تسابق الفاتورة المكرَّرة، انتقال حالة غير
// شرعي) — حتى يستطيع مسار الاعتماد الآلي معالجتها بأمان بلا كسر استجابة
// عرض السعر الناجحة (انظر تعليق try/catch في مسار quote/route.ts). أخطاء
// أخرى غير متوقعة (NO_ORG الدفاعي داخل المعاملة، فشل توليد رقم الفاتورة،
// تسابق المورد المرآة/العميل P2002 غير المرتبط بـorderId، أي استثناء غير
// مصنَّف) تبقى تُرمى كما كانت — المسار اليدوي (route.ts) يلتقطها بنفس catch
// العام الموجود فيه اليوم بلا أي تغيير، ومسار الاعتماد الآلي يلتقطها بـ
// try/catch عام يُبقي الطلب QUOTED ويُسجِّل الخطأ فقط.
import { prisma } from '@/app/lib/prisma';
import { lockWarehouseOrder } from '@/app/lib/warehouse-order-lock';
import { decideMirrorSupplier, buildDraftPurchasePlan, type DraftPurchaseItem } from '@/app/lib/warehouse-purchase-bridge';
import { toStripPrice } from '@/app/lib/pack-units';
import { resolvePackUnits } from '@/app/lib/resolve-pack-units';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import { assertTransition } from '@/app/lib/warehouse-order-state';
import { computeDueDate, checkCreditLimit } from '@/app/lib/warehouse-accounts';
import { customerOutstanding } from '@/app/lib/warehouse-receivables';
import { notifyWarehouseUsers } from '@/app/lib/notifications/notificationTriggers';

/** رفض ائتماني عند الاعتماد — يُترجم إلى ok:false برمز CREDIT_LIMIT أدناه. */
class CreditRejectedError extends Error {}

export type ApprovalOutcome =
    | { ok: true; purchaseId: string; invoiceId: string; invoiceNumber: string; total: number }
    | { ok: false; code: string; message: string; details?: string[]; status: number };

/**
 * يعتمد طلب مذخر (QUOTED → APPROVED): يبني فاتورة شراء مسودة على الصيدلية
 * (من عرض المذخر النهائي)، يُنشئ/يجلب المورد المرآة، يُنشئ/يجلب علاقة
 * WarehouseCustomer، يفحص حدّ الائتمان، وينشئ WarehouseInvoice — كل ذلك في
 * معاملة واحدة ذرّية، تماماً كما كان داخل POST /api/warehouses/orders/[id].
 *
 * `actorType`/`actorName` يُسجَّلان على WarehouseOrderEvent كما هما — القيمة
 * 'SYSTEM' مدعومة صراحة في عمود actorType (نص حر بلا enum في المخطط)، وواجهة
 * متابعة الصيدلية (OrdersTrackClient.tsx) تعرض أي قيمة غير PHARMACY/WAREHOUSE
 * كـ"النظام" أصلاً — فلا قيمة فارغة أو عطل عرض هنا.
 */
export async function approveWarehouseOrder(input: {
    orderId: string;
    actorType: 'PHARMACY' | 'SYSTEM';
    actorName: string | null;
}): Promise<ApprovalOutcome> {
    // بلا فلترة نطاق/منظمة هنا عمداً: الاستدعاء من المسار اليدوي يمر أولاً عبر
    // warehouseOrderScope في route.ts (يتحقق من ملكية الصيدلية للطلب قبل
    // الوصول هنا)، والاستدعاء من الاعتماد الآلي يأتي من بوابة المذخر التي
    // كتبت العرض على هذا orderId للتو — كلا المستدعيين موثوق ضمنياً بأن
    // orderId يخصّهما. جلب واحد يكفي كل شيء: الأصناف لبناء الخطة، وبيانات
    // الفرع/المنظمة لقرار المورد المرآة (بدل جلبين منفصلين كما كان الأصل).
    const order = await prisma.warehouseOrder.findUnique({
        where: { id: input.orderId },
        include: {
            items: {
                select: {
                    drugId: true,
                    quantity: true,
                    unitPrice: true,
                    requestedPrice: true,
                    quotedPrice: true,
                    quotedQuantity: true,
                    status: true,
                    bonusQuantity: true,
                    // ميزة نقل الدفعة/الانتهاء عند التسعير — انظر تعليق
                    // DraftPurchaseItem.batchNumber في warehouse-purchase-bridge.ts.
                    batchNumber: true,
                    expiryDate: true,
                },
            },
            branch: { select: { organizationId: true } },
        },
    });
    if (!order) {
        // ليس رفضاً تجارياً — كلا المستدعيين يضمن وجود الطلب قبل النداء (خرق
        // ثابت لا حالة عمل)، فيُرمى كما هو ليُعالَج بنفس catch العام لدى المستدعي.
        throw new Error(`approveWarehouseOrder: الطلب ${input.orderId} غير موجود`);
    }

    // شرعية الانتقال QUOTED→APPROVED: المسار اليدوي (route.ts) يفحصها فعلاً
    // قبل الوصول هنا (بوابته الخاصة، غير مُعدَّلة)، فهذا الفحص لا يُلمَس هناك
    // أبداً في الممارسة. لكن الاعتماد الآلي (quote/route.ts) لا بوابة خارجية
    // له على الإطلاق — هذا الفحص هو الوحيد الذي يمنعه من إعادة اعتماد طلب
    // اعتُمد/رُفض/أُلغي بالفعل. lockWarehouseOrder أدناه يحرس التسابق (تغيّر
    // الحالة بين هذه اللحظة ولحظة القفل) لا شرعية نقطة البداية نفسها.
    try {
        assertTransition(order.status, 'APPROVED');
    } catch (e: any) {
        return { ok: false, code: 'ILLEGAL_TRANSITION', message: e.message, status: 409 };
    }

    // الاعتماد: بنود فاتورة الشراء من العرض النهائي — عبر effectiveLine()، مصدر
    // الحقيقة الوحيد المشترك مع مسار إجمالي عرض السعر. الأصناف النافدة (quantity=0
    // دائماً لها) تُستبعد هنا قبل الوصول لـ buildDraftPurchasePlan حتى لا تُسجَّل
    // كأخطاء "كمية غير صالحة" رغم كونها استبعاداً متعمَّداً وليس خطأ إدخال.
    const draftItems: DraftPurchaseItem[] = order.items
        .map((it) => {
            const eff = effectiveLine({
                status: it.status,
                quantity: it.quantity,
                quotedQuantity: it.quotedQuantity,
                unitPrice: it.unitPrice,
                quotedPrice: it.quotedPrice,
                // requestedPrice غير مُمرَّر عمداً — effectiveLine لا يستخدمه أصلاً.
            });
            // ميزة البونص: bonusQuantity يمرّ بلا تعديل — buildDraftPurchasePlan
            // هو من يقرر كيف يُبنى منه سطر PurchaseItem منفصل بكلفة صفر (لا
            // حساب هنا). سطر OUT_OF_STOCK (eff.quantity = 0) يُستبعَد بالكامل
            // أدناه قبل الوصول لـ buildDraftPurchasePlan — فبونصه العالق (إن
            // وُجد) لا يُفوتَر ولا يُسلَّم أبداً، اتساقاً مع خصم المخزون.
            //
            // ميزة نقل الدفعة/الانتهاء عند التسعير: batchNumber/expiryDate
            // يمرّان بلا تعديل أيضاً — وعد المذخر عند التسعير كما هو، وصنف
            // OUT_OF_STOCK يحمل null فيهما أصلاً (مسار quote/route.ts يصفّرهما
            // له دائماً)، فيُستبعَد مع بقية حقوله بنفس الفلتر أدناه.
            return {
                drugId: it.drugId,
                quantity: eff.quantity,
                effectivePrice: eff.unitPrice,
                bonusQuantity: it.bonusQuantity,
                batchNumber: it.batchNumber,
                expiryDate: it.expiryDate,
            };
        })
        .filter((it) => it.quantity > 0);

    // ميزة وحدة التسعير — الحدّ بين المذخر والصيدلية.
    //
    // هنا بالضبط كان العطب: سعر المذخر (سعر باكيت عملياً) يُكتب في
    // PurchaseItem.cost ثم يصير Batch.costPrice وهو **سعر شريط** في كل بقية
    // النظام، فتُضخَّم الكلفة بمقدار عدد الأشرطة بصمت وتفسد الهوامش.
    // العلاج بعد قرار «كل أسعار المذاخر أسعار باكيت»: PACKET قاعدة غير
    // مشروطة (toStripPrice)، فلم يعد هناك افتراض صامت يُصلَح؛ ما تبقّى هو
    // استحالة حسابية بحتة — تحويل سعر الباكيت لسعر الشريط يتطلب معرفة عدد
    // الأشرطة في الباكيت. إن جُهل يُوقَف الاعتماد كله برسالة تقول أي صنف ولماذا.
    //
    // نصف الإصلاح لا يكفي: WarehouseOrderItem.quantity نفسها عدد باكيتات
    // (نفس قرار صاحب النظام أعلاه ينطبق على الكمية لا السعر وحده)، بينما
    // Batch.quantity أشرطة. تحويل السعر وحده بلا تحويل الكمية يكسر الثابت
    // (quantity × price) لأن كل طرف يبقى بوحدة مختلفة — لذلك التحويلان
    // يطبَّقان معاً أدناه كزوج واحد بنفس conversion.unitsPerPack، فيبقى
    // الحاصل (عدد الباكيتات × unitsPerPack) × (سعر الباكيت ÷ unitsPerPack)
    // مساوياً لعدد الباكيتات × سعر الباكيت — أي لإجمالي عرض السعر تماماً.
    // العلّة الحقيقية وراء PACK_UNITS_UNRESOLVED الزائف: عدد الأشرطة في الباكيت
    // خاصية **الباركود** لا خاصية صفّ GlobalDrug بعينه (قرار صاحب النظام)، لكن
    // نطاق GlobalDrug ثنائي (organizationId, warehouseId) فقد يملك نفس الباركود
    // أكثر من صفّ: صفّ خاص بالصيدلية (حيث أكّد الصيدلاني التعبئة فعلاً) وصفّ
    // عالمي/مذخر مشترك (وهو ما يشير إليه drugId سطر الطلب غالباً). القراءة عبر
    // drugId السطر وحده كانت تهبط أحياناً على الصفّ الخطأ فتُوقف الاعتماد رغم
    // وجود تأكيد حقيقي على الصفّ الآخر لنفس الباركود — انظر resolve-pack-units.ts.
    //
    // العلاج: نجلب باركود كل صنف، ثم كل صفوف GlobalDrug التي تشارك هذا الباركود
    // **ضمن ما يحقّ لهذه الصيدلية رؤيته فقط** (organizationId فارغ أو مطابق
    // لمؤسسة الطلب، وwarehouseId فارغ أو مطابق لمذخر الطلب) — هذا الفلتر إلزامي
    // ولا يجوز توسيعه: بلا هذا القيد قد تتحكّم قيمة تعبئة خاصة بصيدلية أخرى في
    // كلفة فاتورة هذه الصيدلية بصمت. resolvePackUnits() تحسم رقماً واحداً من
    // هذه المجموعة بقواعد الأولوية (مؤكَّد > مستنتَج، وتعارض داخل نفس الطبقة
    // يوقف الاعتماد).
    const draftDrugIds = Array.from(new Set(draftItems.map((i) => i.drugId)));
    const organizationId = order.branch.organizationId ?? null;
    const [lineDrugs, catalogRows] = await Promise.all([
        prisma.globalDrug.findMany({
            where: { id: { in: draftDrugIds } },
            select: { id: true, tradeName: true, barcode: true },
        }),
        prisma.warehouseCatalogItem.findMany({
            where: { warehouseId: order.warehouseId, drugId: { in: draftDrugIds } },
            // priceUnit لم يعد يُقرأ هنا: PACKET هي القاعدة غير المشروطة داخل
            // toStripPrice — انظر تعليق pack-units.ts.
            select: { drugId: true, unitsPerPack: true },
        }),
    ]);
    const drugById = new Map(lineDrugs.map((d) => [d.id, d]));
    const catalogByDrug = new Map(catalogRows.map((c) => [c.drugId, c]));

    // المطابقة بالباركود المجرَّد (trim) لا الخام: نفس نمط loadDrugAliases
    // (supplier-price-history.ts) وdrug-search/route.ts — صفّ خاص وصفّ عالمي
    // لنفس الدواء قد يحملان نفس الباركود بمسافات زائدة مختلفة (إدخال يدوي)،
    // فمطابقة حرفية هنا قد تُفوّت بالضبط الصفّ المؤكَّد الذي نبحث عنه. نستعلم
    // بكلا الشكلين (كما كُتب في lineDrugs وبعد التجريد) لضمان التقاط أي صفّ
    // مخزَّن بأيّهما، ونُجمِّع دوماً على المفتاح المجرَّد.
    const barcodeKey = (b: string) => b.trim();
    const barcodes = Array.from(
        new Set(lineDrugs.flatMap((d) => [d.barcode, barcodeKey(d.barcode)]).filter(Boolean))
    );
    const packRows = barcodes.length
        ? await prisma.globalDrug.findMany({
              where: {
                  barcode: { in: barcodes },
                  // فلتر النطاق الإلزامي — لا يُوسَّع أبداً (انظر التعليق أعلاه).
                  AND: [
                      { OR: [{ organizationId: null }, { organizationId }] },
                      { OR: [{ warehouseId: null }, { warehouseId: order.warehouseId }] },
                  ],
              },
              select: { barcode: true, unitsPerPack: true, unitsPerPackConfirmedAt: true },
          })
        : [];
    const packRowsByBarcode = new Map<string, typeof packRows>();
    for (const row of packRows) {
        const key = barcodeKey(row.barcode);
        const list = packRowsByBarcode.get(key);
        if (list) list.push(row);
        else packRowsByBarcode.set(key, [row]);
    }

    const unitBlocks: string[] = [];
    const pricedItems: DraftPurchaseItem[] = [];
    for (const it of draftItems) {
        const drug = drugById.get(it.drugId);
        const catalog = catalogByDrug.get(it.drugId);
        const drugName = drug?.tradeName ?? it.drugId;

        // تعارض حقيقي داخل صفوفنا نفسها (مؤكَّدان مختلفان، أو مستنتَجان
        // مختلفان بلا أي تأكيد) — لا يجوز لهذا الكود ترجيح أحدهما آلياً، فيُوقَف
        // السطر هنا مباشرة قبل الوصول لـ toStripPrice أصلاً.
        const resolution = resolvePackUnits(drug?.barcode ? packRowsByBarcode.get(barcodeKey(drug.barcode)) ?? [] : []);
        if (resolution.kind === 'CONFLICT') {
            unitBlocks.push(
                `${drugName}: عدد الأشرطة في الباكيت لهذا الباركود مسجَّل بقيم متعارضة لدينا (${resolution.values.join(' مقابل ')}) — يلزم توحيدها قبل الاعتماد.`
            );
            continue;
        }

        const conversion = toStripPrice({
            price: it.effectivePrice,
            // priceUnit لم يعد يُستشار من order/catalog بعد اليوم: كل أسعار
            // المذاخر أسعار باكيت (قرار صاحب النظام)، وPACKET هي القاعدة غير
            // المشروطة داخل toStripPrice نفسها عند null — انظر pack-units.ts.
            priceUnit: null,
            // resolution.unitsPerPack (عبر كل صفوف الباركود المرئية) لا
            // drug?.unitsPerPack المباشر — هذا هو الإصلاح: قراءة التعبئة بالباركود
            // عبر النطاق المرئي، لا بصفّ GlobalDrug الواحد الذي يشير إليه السطر.
            drugUnitsPerPack: resolution.kind === 'RESOLVED' ? resolution.unitsPerPack : null,
            warehouseUnitsPerPack: catalog?.unitsPerPack ?? null,
        });
        if (!conversion.ok) {
            unitBlocks.push(`${drugName}: ${conversion.message}`);
            continue;
        }
        // conversion.unitsPerPack حصراً — لا drug?.unitsPerPack ولا
        // catalog?.unitsPerPack مباشرة: هذا هو الرقم الذي طبّقه toStripPrice
        // فعلياً بعد تسوية تعارضه بين تعبئتنا وتعبئة المذخر (ورفضه أعلاه إن
        // تعارضا). استخدام رقم آخر هنا قد يفكّك الزوج عن الرقم الذي قُسِّم
        // عليه السعر فعلاً ويكسر الثابت الحسابي أدناه بصمت.
        // bonusQuantity وحدات باكيت أيضاً (تصل الرفّ فعلياً رغم كلفتها
        // الصفرية) فتُضرَب بنفس المعامل، وإلا نزل البونص للمخزون منقوصاً.
        // batchNumber/expiryDate يركبان مع ...it بلا أي تعديل عمداً: تحويل
        // الوحدة يخص الكمية والسعر فقط، لا هوية الدفعة المُعلَنة.
        pricedItems.push({
            ...it,
            quantity: it.quantity * conversion.unitsPerPack,
            effectivePrice: conversion.stripPrice,
            bonusQuantity:
                typeof it.bonusQuantity === 'number'
                    ? it.bonusQuantity * conversion.unitsPerPack
                    : it.bonusQuantity,
        });
    }
    if (unitBlocks.length > 0) {
        return {
            ok: false,
            code: 'PACK_UNITS_UNRESOLVED',
            // لم يعد السبب "وحدة سعر غير محسومة" — كل الأسعار باكيت بلا
            // استثناء الآن. المتبقي الذي يوقف الاعتماد فعلياً هو عدد
            // الأشرطة في الباكيت لهذا الصنف: مجهول أو متعارض مع المذخر،
            // والتفاصيل أدناه تسمّي كل صنف وسببه بالضبط. هذا الحظر يحمي
            // الكمية أيضاً لا السعر وحده الآن: بلا unitsPerPack محسوم لا
            // يمكن ضرب الكمية بأمان أكثر مما يمكن قسمة السعر — فيوقَف
            // السطر كاملاً بدل تسجيل كمية أو كلفة غير موثوقة.
            message:
                'تعذّر اعتماد العرض: عدد الأشرطة في الباكيت غير محسوم لبعض الأصناف ' +
                '(مجهول، أو متعارض بين سجلاتنا، أو متعارض مع ما سجّله المذخر). ' +
                'اشتقاق كلفة الشريط من سعر الباكيت يتطلب هذا الرقم، ' +
                'لذلك أُوقف الاعتماد بدل تسجيل رقم غير موثوق.',
            details: unitBlocks,
            status: 400,
        };
    }

    if (draftItems.length === 0) {
        return {
            ok: false,
            code: 'ALL_ITEMS_OUT_OF_STOCK',
            message: 'كل أصناف هذا الطلب نافدة لدى المذخر — لا يوجد ما يمكن اعتماده أو فوترته. الرجاء رفض العرض بدلاً من اعتماده.',
            status: 400,
        };
    }

    // pricedItems لا draftItems: الأول أسعاره بوحدة الشريط بعد تحويل معلَن،
    // والثاني بالوحدة الخام كما وصلت من العرض.
    const plan = buildDraftPurchasePlan(pricedItems);
    if (!plan.ok) {
        return {
            ok: false,
            code: 'PLAN_BUILD_FAILED',
            message: 'تعذر بناء فاتورة الشراء من العرض',
            details: plan.errors,
            status: 400,
        };
    }

    // المورد المرآة: قرار نقّي + إنشاء آمن ضد التسابق (P2002 → إعادة جلب).
    // المصدر الوحيد للمنظمة الآن: order.branch.organizationId — لا سياق
    // صيدلية هنا (انظر تعليق أعلى الملف). فرعا USE وCREATE أدناه كلاهما
    // يستخدمان نفس هذا المصدر، بلا افتراق بينهما كما كان في الأصل.
    // (organizationId محسوبة أعلاه بالفعل لفلتر نطاق حسم التعبئة — لا تُعاد هنا.)
    const existingMirror = organizationId
        ? await prisma.supplier.findFirst({
              where: { warehouseId: order.warehouseId, organizationId },
              select: { id: true },
          })
        : null;

    const decision = decideMirrorSupplier({
        existingSupplier: existingMirror,
        organizationId,
    });

    if (decision.action === 'BLOCKED_NO_ORG') {
        return {
            ok: false,
            code: 'BLOCKED_NO_ORG',
            message: 'لا يمكن اعتماد الطلب: الحساب غير مرتبط بمنظمة لإنشاء مورد للمذخر.',
            status: 403,
        };
    }

    const approvedAt = new Date();

    try {
        const txResult = await prisma.$transaction(async (tx) => {
            await lockWarehouseOrder(tx, order.id, order.status);
            let supplierId: string;
            let customerOrgId: string;

            if (decision.action === 'USE') {
                supplierId = decision.supplierId!;
                // USE فقط عندما وُجد مورد مرآة موجود، وهذا لا يحدث إلا إن كان
                // organizationId صالحاً أصلاً (existingMirror أعلاه لا يُستعلَم
                // عنه إلا حين يكون هذا الحقل حقيقياً) — نفس الضمان المنطقي الذي
                // يستند إليه "!" في السطر أعلاه.
                customerOrgId = organizationId!;
            } else {
                // CREATE: نحتاج اسم المذخر + الفرع — جلب داخل المعاملة (تحقّق
                // دفاعي أحدث من organizationId وقت الالتزام الفعلي، لا وقت
                // الجلب الأول أعلاه؛ نفس نمط الأصل بالضبط).
                const [warehouse, orderWithBranch] = await Promise.all([
                    tx.warehouse.findUnique({ where: { id: order.warehouseId }, select: { name: true } }),
                    tx.warehouseOrder.findUnique({
                        where: { id: order.id },
                        select: { branch: { select: { organizationId: true } } },
                    }),
                ]);
                const orgId = orderWithBranch?.branch.organizationId ?? null;
                if (!orgId) {
                    throw new Error('NO_ORG');
                }
                const mirror = await tx.supplier.create({
                    data: {
                        name: `مذخر على المنصة: ${warehouse?.name ?? order.warehouseId}`,
                        warehouseId: order.warehouseId,
                        organizationId: orgId,
                    },
                });
                supplierId = mirror.id;
                customerOrgId = orgId;
            }

            // Phase 2: العلاقة التجارية (WarehouseCustomer) — تُنشأ تلقائياً عند أول
            // تعامل بين هذا المذخر وهذه الصيدلية، بنفس نمط المورد المرآة أعلاه
            // (بحث ثم إنشاء؛ التسابق يُحل عبر @@unique([warehouseId, organizationId])
            // + معالجة P2002 في catch أدناه). القيم الافتراضية (بلا حد ائتماني،
            // نقدي بلا مهلة) تُطبَّق من أول فاتورة حتى يضبطها مالك المذخر لاحقاً.
            let customer = await tx.warehouseCustomer.findUnique({
                where: { warehouseId_organizationId: { warehouseId: order.warehouseId, organizationId: customerOrgId } },
            });
            if (!customer) {
                customer = await tx.warehouseCustomer.create({
                    data: { warehouseId: order.warehouseId, organizationId: customerOrgId },
                });
            }

            await tx.$queryRaw`SELECT "id" FROM "WarehouseCustomer" WHERE "id" = ${customer.id} FOR UPDATE`;
            customer = await tx.warehouseCustomer.findUniqueOrThrow({ where: { id: customer.id } });
            const purchase = await tx.purchase.create({
                data: {
                    branchId: order.branchId,
                    supplierId,
                    total: plan.total,
                    status: 'PENDING',
                    items: {
                        // batchNumber/expiryDate: ميزة نقل الدفعة/الانتهاء عند
                        // التسعير — ?? null صريحة (لا ترك الحقل بلا قيمة) لأن
                        // PurchaseItem.batchNumber/expiryDate عمودان حقيقيان في
                        // المخطط، بخلاف plan.items أعلاه حيث ?? undefined كانت
                        // مقصودة فقط لحماية اختبارات buildDraftPurchasePlan القديمة.
                        create: plan.items.map((i) => ({
                            drugId: i.drugId,
                            quantity: i.quantity,
                            cost: i.cost,
                            batchNumber: i.batchNumber ?? null,
                            expiryDate: i.expiryDate ?? null,
                        })),
                    },
                },
            });

            // Phase 2: فاتورة المذخر على هذه الصيدلية. total = plan.total بالضبط —
            // نفس المتغيّر المُستخدَم لإجمالي Purchase أعلاه حرفياً، وليس محسوباً من
            // جديد بقاعدة مختلفة؛ هذا هو الثابت الذي يبقي فاتورة الشراء (جانب
            // الصيدلية) وفاتورة المذخر (جانب المذخر) متفقتين ماليّاً دوماً.
            //
            // رقم الفاتورة: طابع زمني base-36 + محاولات فحص تفرّد + فشل صريح
            // بدل مرور رقم null بصمت.
            let invoiceNumber: string | null = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                const candidate = `WI-${Date.now().toString(36).toUpperCase()}${attempt ? `-${attempt}` : ''}`;
                const exists = await tx.warehouseInvoice.findUnique({ where: { invoiceNumber: candidate } });
                if (!exists) {
                    invoiceNumber = candidate;
                    break;
                }
            }
            if (invoiceNumber === null) {
                throw new Error('WI_NUMBER_GENERATION_FAILED');
            }

            // orderId فريد على WarehouseInvoice: لو دخل طلبان متزامنان هذه المعاملة
            // معاً بنفس order.id (كلاهما قرأ الحالة QUOTED قبل أن يُحدِّث أيّهما)،
            // فإن create الثاني هنا يضرب قيد التفرد على orderId ويُفشل معاملته
            // بالكامل (Purchase/customer/order-update معه) — لا فاتورة مكرَّرة ولا
            // Purchase يتيمة من الخاسر. catch أدناه يميّز هذه الحالة تحديداً.
            // حدّ الائتمان يُفحص هنا أيضاً، لا عند إنشاء الطلب فقط: عند الإنشاء
            // يكون unitPrice غالباً 0 (السعر يُحسم عند التسعير)، فيُفحص الحدّ ضد
            // إجمالي صفري ولا يمنع شيئاً أبداً. الاعتماد هو لحظة الالتزام الحقيقي
            // وفيه plan.total معروف — فهنا يبيت الفحص ذا معنى.
            if (customer.isBlocked) {
                throw new CreditRejectedError(
                    'هذا المذخر أوقف التعامل مع صيدليتك — لا يمكن اعتماد الطلب.'
                );
            }
            if (customer.creditLimit > 0) {
                // يشمل دفترَي الذمم: فواتير طلبات المنصة **و** فواتير البيع
                // الميداني للمندوبين (فحص 2026-09-17، فجوة G1). كان هذا الموضع
                // يجمع الأول وحده، فدَين البيع الميداني لا يُحسب على الحدّ وصيدلية
                // بلغت حدّها فعلاً يُعتمد طلبها. لا يُستثنى الاعتماد الآلي من هذا
                // الفحص إطلاقاً — صيدلية تجاوزت حدّها لا تُعتمَد آلياً، تماماً
                // كما لا تُعتمَد يدوياً.
                //
                // customer.openingBalance (لا استعلام مستقل عنه): customer أعلاه
                // هو نفس الصفّ المقفل بـSELECT ... FOR UPDATE قبل قليل — فرصيدها
                // السابق يدخل الفحص من نفس اللقطة الذرّية، لا من قراءة منفصلة قد
                // تسبق أو تلي القفل. صيدلية مديونة أصلاً برصيد سابق يتجاوز حدّها
                // لا تُعتمَد كأن دَينها صفر (الثغرة التي تسدّها هذه الميزة بالذات).
                const outstanding = await customerOutstanding(tx, order.warehouseId, customerOrgId, customer.openingBalance);
                const credit = checkCreditLimit({
                    creditLimit: customer.creditLimit,
                    outstanding,
                    newOrderTotal: plan.total,
                });
                if (!credit.ok) {
                    throw new CreditRejectedError(credit.error);
                }
            }

            const invoice = await tx.warehouseInvoice.create({
                data: {
                    warehouseId: order.warehouseId,
                    organizationId: customerOrgId,
                    orderId: order.id,
                    invoiceNumber,
                    total: plan.total,
                    dueAt: computeDueDate(approvedAt, customer.paymentTermDays),
                },
            });

            await tx.warehouseOrder.update({ where: { id: order.id }, data: { status: 'APPROVED' } });

            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: order.id,
                    actorType: input.actorType,
                    actorName: input.actorName,
                    type: 'APPROVED',
                    payload: { purchaseId: purchase.id, supplierId, total: plan.total, invoiceId: invoice.id, invoiceNumber },
                },
            });

            return { purchaseId: purchase.id, invoiceId: invoice.id, invoiceNumber, total: plan.total };
        });

        // إشعار المذخر بالاعتماد — النص يفرّق بين المسارين عمداً: في الاعتماد
        // الآلي، مستلم الإشعار هو مذخري ضغط للتو "إرسال العرض" بنفسه ويعرف يقيناً
        // أن لا صيدلاني لمسه؛ رسالة "اعتمدت الصيدلية..." كانت ستصل هاتفه بحدث لم
        // يقع فعلاً (لا صيدلية اعتمدت شيئاً، طابق عرضه هو طلبها تماماً فقط) —
        // نفس معيار الصدق المطبَّق على actorType في الـTimeline وToast الواجهة.
        // notifyWarehouseUsers نفسها لا ترمي أبداً (try/catch داخلي)، فوضعها هنا آمن.
        await notifyWarehouseUsers({
            warehouseId: order.warehouseId,
            title: 'تم اعتماد طلب المذخر',
            body:
                input.actorType === 'SYSTEM'
                    ? `طابق عرضك طلب الصيدلية ${order.orderNumber ?? ''} تماماً فاعتُمد تلقائياً. يمكنك تجهيز الشحن الآن.`
                    : `اعتمدت الصيدلية عرض السعر للطلب ${order.orderNumber ?? ''}. يمكنك تجهيز الشحن الآن.`,
            data: { orderId: order.id, orderNumber: order.orderNumber, status: 'APPROVED' },
        });

        return { ok: true, ...txResult };
    } catch (e: any) {
        if (e instanceof CreditRejectedError) {
            return { ok: false, code: 'CREDIT_LIMIT', message: e.message, status: 403 };
        }
        // نفس فحص النص المستخدَم في catch العام الأصلي — يلتقط رسالة
        // lockWarehouseOrder (تغيّرت الحالة أثناء المعالجة) *و* رسالة
        // assertTransition لو رُميت من مكان آخر بنفس الصياغة، بجملة واحدة.
        if (e?.message?.includes('انتقال غير شرعي')) {
            return { ok: false, code: 'ILLEGAL_TRANSITION', message: e.message, status: 409 };
        }
        if (e?.code === 'P2002') {
            // meta.target يختلف شكله بين إصدارات Prisma/محرّكات القواعد: أحياناً
            // مصفوفة أسماء أعمدة (['orderId'])، وأحياناً نص اسم القيد الكامل
            // ("WarehouseInvoice_orderId_key"). لا نراهن على شكل واحد — نحوّله
            // إلى نص ونبحث عن "orderId" فيه أياً كان الشكل.
            const rawTarget = e?.meta?.target;
            const targetStr = Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget ?? '');
            if (targetStr.includes('orderId')) {
                return {
                    ok: false,
                    code: 'DUPLICATE_INVOICE_RACE',
                    message: 'هذا الطلب اعتُمد للتو ضمن طلب متزامن آخر — الفاتورة موجودة بالفعل ولا حاجة لإعادة المحاولة.',
                    status: 409,
                };
            }
            // تسابق المورد المرآة/حساب العميل (organizationId, warehouseId): غير
            // مُدرَج في قائمة الرفض التجاري المُحوَّلة — يُترك يتصاعد كما كان
            // (P2002 خام)، فيعالجه catch العام لدى المستدعي بنفس رسالته الأصلية.
        }
        // NO_ORG الدفاعي، WI_NUMBER_GENERATION_FAILED، أو أي خطأ غير مصنَّف آخر:
        // يبقى يتصاعد — المسار اليدوي يلتقطه بنفس catch العام غير المُعدَّل في
        // route.ts، ومسار الاعتماد الآلي يلتقطه بـ try/catch عام (قاعدة أمان 2).
        throw e;
    }
}
