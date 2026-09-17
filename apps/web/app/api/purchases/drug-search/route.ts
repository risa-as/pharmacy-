export const dynamic = 'force-dynamic';

// المرحلة 2 من ميزة «طلب الأدوية حسب الاحتياج»: بحث أصناف لقائمة الاحتياج.
//
// لماذا مسار جديد ولم يُعَد استخدام /api/inventory/search (§230): ذاك المسار
// يُرشِّح النتيجة على الأدوية التي لها صف مخزون (`filter(d => invMap.has(d.id))`)
// ولا يبحث بالباركود. وقائمة الاحتياج تحتاج العكس تماماً: الدواء الذي **نفد**
// مخزونه هو أول ما يُطلب (§68)، والبحث بالباركود مطلوب صراحةً (§65).
//
// هوية الدواء والإرسال (§150/§152): معرّف الدواء المحلي يكفي للمقارنة، لكن الإرسال
// للمذخر يحتاج المقابل **العالمي** (organizationId: null و warehouseId: null معاً).
// لذلك يُحسب لكل نتيجة معرّفها العالمي وحالته، وتُعلَن الحالات الثلاث: بلا باركود،
// بلا مقابل عالمي، أو مطابقة غامضة (أكثر من صف عالمي بنفس الباركود). ولا يُنشأ ولا
// يُرقَّى أي دواء عالمياً تلقائياً من هذا المسار.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { pharmacyDrugScope } from '@/app/lib/drug-scope';
import { resolveHistoryScope } from '@/app/lib/supplier-price-history';
import { resolvePurchaseIdentity } from '@/app/lib/purchase-drug-identity';

const PAGE_SIZE = 20;
const MIN_QUERY = 2;

export type DrugOrderability =
    | 'GLOBAL'
    | 'MAPPED_BY_BARCODE'
    | 'NO_BARCODE'
    | 'NO_GLOBAL_MATCH'
    | 'AMBIGUOUS_BARCODE';

const ORDERABILITY_REASON: Record<DrugOrderability, string | null> = {
    GLOBAL: null,
    MAPPED_BY_BARCODE: null,
    NO_BARCODE: 'هذا الصنف بلا باركود صالح، والباركود هو ما يفهمه الطرفان — لا يمكن إرساله.',
    NO_GLOBAL_MATCH: 'لا يوجد صنف عالمي بهذا الباركود، فلا يمكن للمذخر التعرّف عليه.',
    AMBIGUOUS_BARCODE: 'يوجد أكثر من صنف عالمي بهذا الباركود — مطابقة غامضة تحتاج مراجعة الإدارة.',
};

export async function GET(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    if (!tenantCtx.userPermissions.canCreatePurchase) {
        return NextResponse.json(
            { error: 'ليس لديك صلاحية إنشاء المشتريات.', code: 'FORBIDDEN' },
            { status: 403 }
        );
    }

    try {
        const scope = await resolveHistoryScope(tenantCtx);
        if (!scope) return NextResponse.json({ error: 'لا يوجد نطاق مؤسسة صالح.' }, { status: 403 });
        const { searchParams } = new URL(req.url);
        const query = (searchParams.get('query') || '').trim().slice(0, 100);
        if (query.length < MIN_QUERY) return NextResponse.json({ items: [] });
        // الافتراضي: أدوية مخزون فروع النطاق فقط (بما فيها النافدة — §68: وجود صف
        // مخزون لا رصيد موجب). ?scope=all يوسّع البحث إلى كتالوج المنصة لطلب دواء
        // جديد لم يسبق تخزينه، بطلب صريح من المستخدم.
        const catalogWide = searchParams.get('scope') === 'all';

        const drugs = await prisma.globalDrug.findMany({
            where: {
                ...pharmacyDrugScope(tenantCtx.organizationId),
                isActive: true,
                ...(catalogWide ? {} : { inventories: { some: { branchId: { in: scope.branchIds } } } }),
                AND: [
                    {
                        OR: [
                            { tradeName: { contains: query, mode: 'insensitive' as const } },
                            { scientificName: { contains: query, mode: 'insensitive' as const } },
                            { barcode: { contains: query } },
                        ],
                    },
                ],
            },
            select: {
                id: true,
                barcode: true,
                tradeName: true,
                scientificName: true,
                origin: true,
                organizationId: true,
            },
            orderBy: { tradeName: 'asc' },
            take: PAGE_SIZE,
        });

        if (drugs.length === 0) return NextResponse.json({ items: [] });

        // صفوف المؤسسة الخاصة تحتاج مقابلاً عالمياً بنفس الباركود. استعلام مجمَّع
        // واحد لكل الباركودات، لا استعلام لكل صنف.
        const barcodes = Array.from(new Set(drugs.map(d => d.barcode.trim()).filter(Boolean)));
        const candidates = barcodes.length ? await prisma.globalDrug.findMany({
            where: { ...pharmacyDrugScope(scope.organizationId), barcode: { in: barcodes } },
            select: { id: true, barcode: true, tradeName: true, scientificName: true, organizationId: true },
        }) : [];
        const identities = new Map(drugs.map(d => [d.id, resolvePurchaseIdentity(d, candidates)]));
        const allIds = Array.from(new Set(Array.from(identities.values()).flatMap(i => i.ids)));

        // الرصيد الحالي معلومة مساعِدة فقط — لا يُرشِّح النتائج (§68).
        const stockRows = await prisma.inventory.findMany({
            where: { drugId: { in: allIds }, branchId: { in: scope.branchIds } },
            select: { drugId: true, batches: { where: { quantity: { gt: 0 } }, select: { quantity: true } } },
        });
        const stock = new Map<string, number>();
        const stocked = new Set<string>();
        for (const row of stockRows) {
            stocked.add(row.drugId);
            const qty = row.batches.reduce((s, b) => s + b.quantity, 0);
            stock.set(row.drugId, (stock.get(row.drugId) ?? 0) + qty);
        }

        const items = drugs.map((d) => {
            const barcode = d.barcode.trim();
            const identity = identities.get(d.id)!;
            const orderability = identity.reason;
            const globalDrugId = identity.globalDrugId;
            return {
                id: d.id,
                barcode,
                tradeName: d.tradeName,
                scientificName: d.scientificName,
                origin: d.origin,
                isOrgPrivate: d.organizationId !== null,
                currentStock: identity.ids.reduce((sum, id) => sum + (stock.get(id) ?? 0), 0),
                // له صف مخزون في فروع النطاق (ولو برصيد صفر) — بخلاف دواء من الكتالوج لم يُخزَّن قط.
                inInventory: identity.ids.some((id) => stocked.has(id)),
                globalDrugId,
                orderability,
                orderabilityReason: ORDERABILITY_REASON[orderability],
            };
        });

        const seen = new Set<string>();
        const unique = items.filter(item => {
            const key = item.globalDrugId ?? item.id;
            if (seen.has(key)) return false;
            seen.add(key); return true;
        });
        return NextResponse.json({ items: unique });
    } catch (e) {
        console.error('purchases drug-search GET error:', e);
        return NextResponse.json({ error: 'فشل في البحث عن الأدوية' }, { status: 500 });
    }
}
