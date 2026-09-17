export const dynamic = 'force-dynamic';

// المرحلة 2: السجل التفصيلي لأسعار زوج (دواء، مورد) — مرقّم الصفحات ويُطلَب عند
// الحاجة فقط، فلا تُحمَّل كل دفعات كل دواء عند فتح صفحة الطلب (§91).
//
// سجلات الدفعات وسجلات الفواتير تُعاد **منفصلة** لا مدموجة في سلسلة واحدة (§120):
// تاريخ الدفعة «تاريخ تسجيل الدفعة» وتاريخ الفاتورة «تاريخ تسجيل الفاتورة»، ولا
// يوجد دليل يجعل خلطهما سلسلة شراء واحدة موثوقة.
import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { loadPairHistory, resolveHistoryScope } from '@/app/lib/supplier-price-history';

export async function GET(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    if (!tenantCtx.userPermissions.canCreatePurchase) {
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
        const { searchParams } = new URL(req.url);
        const drugId = (searchParams.get('drugId') || '').trim();
        const supplierId = (searchParams.get('supplierId') || '').trim();
        const page = Math.max(1, Math.min(500, Math.floor(Number(searchParams.get('page')) || 1)));

        if (!drugId || !supplierId) {
            return NextResponse.json({ error: 'drugId وsupplierId مطلوبان.' }, { status: 400 });
        }

        const history = await loadPairHistory(scope, drugId, supplierId, page);
        return NextResponse.json({ ...history, page });
    } catch (e) {
        console.error('supplier-prices history GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب سجل الأسعار' }, { status: 500 });
    }
}
