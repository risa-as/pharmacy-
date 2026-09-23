export const dynamic = 'force-dynamic';

// المرحلة 2 من ميزة «طلب الأدوية حسب الاحتياج»: مقارنة أسعار الموردين لأدوية محددة.
//
// يعيد لكل دواء: آخر سعر مؤهل لكل مورد مرتّباً تصاعدياً، والأرخص، وأرخص خيار قابل
// للإرسال فعلاً (وقد يختلف عن الأرخص — §78). المنطق كله في
// app/lib/supplier-price-comparison.ts النقية؛ هذا المسار يحرس ويجلب ويُرتّب فقط.
//
// النطاق يأتي من الخادم حصراً: لا organizationId ولا branchId من جسم الطلب (§146).
// البوابة `canCreatePurchase` — نفس بوابة POST /api/warehouses/orders، فلا يكشف هذا
// المسار تكاليف لدور محجوبة عنه في بقية التطبيق (§266).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { compareDrugPrices } from '@/app/lib/supplier-price-comparison';
import { loadPriceRecords, resolveHistoryScope, MAX_DRUG_IDS } from '@/app/lib/supplier-price-history';

export async function POST(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    if ((!tenantCtx.userPermissions.canCreatePurchase && !tenantCtx.userPermissions.canCreateWarehouseOrder)) {
        return NextResponse.json(
            { error: 'ليس لديك صلاحية الاطلاع على أسعار المشتريات.', code: 'FORBIDDEN' },
            { status: 403 }
        );
    }

    const scope = await resolveHistoryScope(tenantCtx);
    if (!scope) {
        return NextResponse.json(
            { error: 'لا يوجد نطاق مؤسسة/فرع صالح لعرض تاريخ الأسعار.', code: 'NO_SCOPE' },
            { status: 400 }
        );
    }

    try {
        const body = await req.json().catch(() => ({}));
        if (!Array.isArray(body?.drugIds)) {
            return NextResponse.json({ error: 'drugIds مطلوب كمصفوفة.' }, { status: 400 });
        }
        if (body.drugIds.length > MAX_DRUG_IDS) {
            return NextResponse.json(
                { error: `الحد الأقصى ${MAX_DRUG_IDS} صنفاً في الطلب الواحد.` },
                { status: 400 }
            );
        }

        // loadPriceRecords يُطبّع المعرّفات ويحذف المكرر ويقصّ على الحد بنفسه.
        const records = await loadPriceRecords(scope, body.drugIds);

        // Explicit user review for this request only, not a permanent data correction.
        const verified = new Set(Array.isArray(body.verifiedUnitDrugIds)
            ? body.verifiedUnitDrugIds.filter((id: unknown) => typeof id === 'string' && body.drugIds.includes(id)) : []);

        // ميزة وحدة التسعير: تأشيرة المستخدم لكل طلب كانت العلاج الوحيد المتاح
        // حين لا يعرف النظام تعبئة الدواء. الآن صار للتعبئة مكان دائم، فالدواء
        // الذي **أكّد صيدلاني** تعبئته تصير وحدته موثَّقة بذاتها بلا تأشير متكرر،
        // فتتقاعد الآلية تلقائياً كلما اتّسعت البيانات.
        //
        // الشرط على unitsPerPackConfirmedAt لا على unitsPerPack: أكثر من ألف قيمة
        // محمَّلة استنتاجاً من دفعات قديمة ونحو نصفها غير دقيق، فوجود رقم لا يعني
        // أن أحداً تحقّق منه. الاكتفاء بوجود الرقم كان سيرفع الحماية عن الأدوية
        // التي هي أحوج ما تكون إليها.
        const drugIdsInPlay = Array.from(records.keys());
        const packed = drugIdsInPlay.length
            ? await prisma.globalDrug.findMany({
                  where: { id: { in: drugIdsInPlay } },
                  select: { id: true, unitsPerPack: true, unitsPerPackConfirmedAt: true },
              })
            : [];
        const unitKnown = new Set(
            packed.filter((d) => d.unitsPerPackConfirmedAt !== null).map((d) => d.id),
        );
        // تُعاد للواجهة لتشتقّ سعر الباكيت (سعر الشريط × العدد) — المذخر
        // يسعّر بالباكيت، فمقارنة بسعر الشريط وحده تترك المشتري يحوّل ذهنياً.
        const unitsPerPack: Record<string, number | null> = {};
        for (const d of packed) {
            unitsPerPack[d.id] = d.unitsPerPackConfirmedAt !== null ? d.unitsPerPack : null;
        }

        const now = new Date();
        const comparisons: Record<string, ReturnType<typeof compareDrugPrices>> = {};
        for (const [drugId, list] of Array.from(records.entries())) {
            const unitVerified = verified.has(drugId) || unitKnown.has(drugId);
            comparisons[drugId] = compareDrugPrices({ records: list.map(r => ({ ...r, unitVerified })), now });
        }

        return NextResponse.json({
            comparisons,
            unitsPerPack,
            // يُعرض في الواجهة كي لا يُقرأ التاريخ كإثبات لآخر شراء فعلي (§124).
            disclaimer:
                'هذه أحدث الأسعار المسجَّلة في بياناتك (تاريخ تسجيل الدفعة أو الفاتورة)، وليست إثباتاً لآخر شراء فعلي — قد لا تشمل عمليات محذوفة.',
        });
    } catch (e) {
        console.error('supplier-prices POST error:', e);
        return NextResponse.json({ error: 'فشل في جلب مقارنة الأسعار' }, { status: 500 });
    }
}
