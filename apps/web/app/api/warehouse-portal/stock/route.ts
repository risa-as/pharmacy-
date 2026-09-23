export const dynamic = 'force-dynamic';

// المرحلة ب من ميزة تتبّع مخزون المذخر: قراءة مخزون كتالوج المذخر — لا كتابة هنا
// (الاستلام/التعديل/الإتلاف في مساراتهم الخاصة تحت هذا المجلد). كل الحساب يمر
// عبر app/lib/warehouse-stock.ts (summarizeStock/isLowStock/deriveAvailability/
// expiryBucket) — لا يُعاد حساب أي قاعدة هنا.
import { loadWarehouseStock } from '@/app/lib/warehouse-stock-data';
import { warehousePage } from '@/app/lib/warehouse-pagination';
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';

type StockFilter = 'low' | 'expiring' | 'out';

// GET: كتالوج مذخري مع أرصدة محسوبة — ?filter=low|expiring|out و ?search=
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewStock');
        if (!gate.ok) return gate.response;

        // كلفة الشراء وهامش الربح بيانات مالية حسّاسة: canViewStock وحدها لا
        // تكفي لكشفهما. SALES و INVENTORY يملكان canViewStock ولا يملكان
        // canViewFinance، فيجب أن يصلهما ردّ بلا كلفة ولا هامش — حذفاً من
        // الحمولة نفسها لا إخفاءً في الواجهة (الواجهة ليست حارساً).
        const canViewFinance = hasWarehousePermission(gate.actor, 'canViewFinance');

        const { searchParams } = new URL(req.url);
        const search = (searchParams.get('search') || '').trim();
        const filter = (searchParams.get('filter') || undefined) as StockFilter | undefined;
        if (filter && !['all', 'low', 'expiring', 'out'].includes(filter)) return NextResponse.json({ error: 'فلتر غير صالح' }, { status: 400 });

        // مصدر الحقيقة الوحيد لملكية الصنف: warehouseId من السياق حصراً — لا
        // مذخر يقرأ مخزون مذخر آخر مهما كانت معاملات الطلب.
        const { page } = warehousePage(searchParams);
        return NextResponse.json(await loadWarehouseStock(ctx.warehouseId, canViewFinance, search, filter, page));
    } catch (e: any) {
        console.error('warehouse-portal stock GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب المخزون' }, { status: 500 });
    }
}
