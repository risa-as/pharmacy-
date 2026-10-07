export const dynamic = 'force-dynamic';

// بحث الدواء في صفحة «إضافة للمخزون». كانت الصفحة ترسل كتالوج المنصة كاملاً
// إلى المتصفح وتعرضه في <select> واحدة، فتثقل الصفحة بمجرد فتح القائمة. هنا
// تُجلب 20 نتيجة فقط لما يكتبه المستخدم، مع علامة «موجود في مخزون هذا الفرع»
// لأن createInventory يرفض تكرار الصنف في الفرع نفسه.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { pharmacyDrugScope } from '@/app/lib/drug-scope';

const PAGE_SIZE = 20;
const MIN_QUERY = 2;

export type DrugOption = {
    id: string;
    tradeName: string;
    scientificName: string;
    barcode: string;
    origin: string | null;
    /** له صف مخزون في الفرع المختار؛ false حين لا يُعرف الفرع أو هو خارج النطاق. */
    inBranch: boolean;
};

const select = { id: true, tradeName: true, scientificName: true, barcode: true, origin: true } as const;

export async function GET(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.userPermissions.canAddDrug) {
        return NextResponse.json({ error: 'ليس لديك صلاحية لإضافة أدوية للمخزون.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('query') || '').trim().slice(0, 100);
    if (query.length < MIN_QUERY) return NextResponse.json({ items: [] });

    try {
        const base = { isActive: true, ...pharmacyDrugScope(tenantCtx.organizationId) };
        const text = (field: 'tradeName' | 'scientificName', op: 'startsWith' | 'contains') =>
            ({ [field]: { [op]: query, mode: 'insensitive' as const } });

        // الأقرب أولاً: باركود مطابق تماماً، ثم اسم يبدأ بالنص، ثم ما يحتويه.
        const [exact, prefix, rest] = await Promise.all([
            prisma.globalDrug.findMany({ where: { ...base, barcode: query }, select, take: PAGE_SIZE }),
            prisma.globalDrug.findMany({ where: { ...base, ...text('tradeName', 'startsWith') }, select, orderBy: { tradeName: 'asc' }, take: PAGE_SIZE }),
            prisma.globalDrug.findMany({
                where: { ...base, AND: [{ OR: [text('tradeName', 'contains'), text('scientificName', 'contains'), { barcode: { contains: query } }] }] },
                select, orderBy: { tradeName: 'asc' }, take: PAGE_SIZE,
            }),
        ]);
        const seen = new Set<string>();
        const drugs = [...exact, ...prefix, ...rest].filter((d) => !seen.has(d.id) && seen.add(d.id)).slice(0, PAGE_SIZE);

        // الفرع يُتحقق من نطاقه قبل استعماله، كما في createInventory، فلا يُستطلع به مخزون مؤسسة أخرى.
        const branchId = searchParams.get('branchId');
        const branch = branchId && drugs.length
            ? await prisma.branch.findFirst({ where: { AND: [tenantCtx.branchModelWhere, { id: branchId }] }, select: { id: true } })
            : null;
        const stocked = branch
            ? new Set((await prisma.inventory.findMany({
                where: { branchId: branch.id, drugId: { in: drugs.map((d) => d.id) } },
                select: { drugId: true },
            })).map((row) => row.drugId))
            : new Set<string>();

        const items: DrugOption[] = drugs.map((d) => ({ ...d, inBranch: stocked.has(d.id) }));
        return NextResponse.json({ items });
    } catch (e) {
        console.error('inventory drug-options GET error:', e);
        return NextResponse.json({ error: 'فشل في البحث عن الأدوية' }, { status: 500 });
    }
}
