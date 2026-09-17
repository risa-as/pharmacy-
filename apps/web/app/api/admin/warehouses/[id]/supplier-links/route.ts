export const dynamic = 'force-dynamic';

// المرحلة 1 من ميزة «طلب الأدوية حسب الاحتياج»: ربط مورد محلي بمذخر (SUPER_ADMIN).
//
// مفصول عن [id]/route.ts عمداً: ذاك يعدّل بيانات المذخر نفسه، وهذا يكتب حقلاً على
// Supplier يخص مؤسسة أخرى — خلطهما كان سيجعل بوابة تحقق واحدة تحرس عمليتين
// مختلفتي الأثر تماماً.
//
// ما لا يفعله هذا المسار عمداً (§176): لا فكّ ربط ولا إعادة توجيه. الربط يوجّه
// فواتير الطلبات الجديدة إلى مورد موجود ويحافظ على تاريخه؛ ولا ينقل رصيداً ولا
// يدمج سجلات ولا يغيّر أي فاتورة أو دين قائم.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';
import { logAudit } from '@/app/lib/audit';
import { linkSupplierToWarehouse } from '@/app/lib/supplier-link-service';

const SEARCH_MAX = 100;

async function requireSuperAdmin() {
    const session = await auth();
    if (!session?.user) {
        return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    if (!canCreateWarehouse(session.user.role)) {
        return {
            ok: false as const,
            response: NextResponse.json(
                { error: 'ربط الموردين بالمذاخر متاح لإدارة المنصة فقط.', code: 'SUPER_ADMIN_ONLY' },
                { status: 403 }
            ),
        };
    }
    return { ok: true as const, user: session.user as { id?: string; name?: string; email?: string } };
}

// GET: حالة الربط لهذا المذخر + موردو مؤسسة محددة للاختيار منهم.
// ?organizationId=… يقصر قائمة الموردين على تلك المؤسسة؛ بدونه تُعاد الروابط القائمة فقط.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const gate = await requireSuperAdmin();
    if (!gate.ok) return gate.response;

    try {
        const warehouse = await prisma.warehouse.findUnique({
            where: { id: params.id },
            select: { id: true, name: true, isActive: true },
        });
        if (!warehouse) {
            return NextResponse.json({ error: 'المذخر غير موجود' }, { status: 404 });
        }

        const { searchParams } = new URL(req.url);
        const organizationId = (searchParams.get('organizationId') || '').trim();
        const search = (searchParams.get('search') || '').trim().slice(0, 100);

        // الروابط القائمة لهذا المذخر عبر كل المؤسسات — هذا ما يراه المشرف أولاً.
        const links = await prisma.supplier.findMany({
            where: { warehouseId: warehouse.id },
            select: {
                id: true,
                name: true,
                phone: true,
                organizationId: true,
                organization: { select: { id: true, name: true } },
            },
            orderBy: { name: 'asc' },
        });

        // موردو المؤسسة المختارة. الرصيد غير مُعاد عمداً (§165): الربط لا يحتاجه.
        const suppliers = organizationId
            ? await prisma.supplier.findMany({
                  where: {
                      organizationId,
                      ...(search
                          ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { phone: { contains: search } }] }
                          : {}),
                  },
                  select: { id: true, name: true, phone: true, warehouseId: true },
                  orderBy: { name: 'asc' },
                  take: SEARCH_MAX,
              })
            : [];

        return NextResponse.json({ warehouse, links, suppliers });
    } catch (e) {
        console.error('supplier-links GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب بيانات الربط' }, { status: 500 });
    }
}

// POST: ربط مورد واحد بهذا المذخر — { organizationId, supplierId }
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const gate = await requireSuperAdmin();
    if (!gate.ok) return gate.response;

    try {
        const body = await req.json().catch(() => ({}));
        const organizationId = typeof body?.organizationId === 'string' ? body.organizationId.trim() : '';
        const supplierId = typeof body?.supplierId === 'string' ? body.supplierId.trim() : '';
        if (!organizationId || !supplierId) {
            return NextResponse.json({ error: 'المؤسسة والمورد مطلوبان.' }, { status: 400 });
        }

        // الفحوص والكتابة المحروسة ضد السباق في supplier-link-service — نفس ما يستعمله
        // اعتماد طلبات الربط، فلا يتفرّع المساران.
        const outcome = await linkSupplierToWarehouse(prisma, { warehouseId: params.id, organizationId, supplierId });
        if (!outcome.ok) {
            return NextResponse.json(
                { error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) },
                { status: outcome.status }
            );
        }
        const { supplier, warehouse, organization } = outcome;
        // تكرار الربط نفسه يعيد نجاحاً بلا أثر إضافي ولا سطر تدقيق (§174).
        if (outcome.alreadyLinked) {
            return NextResponse.json({ ok: true, alreadyLinked: true, supplier });
        }

        // ربط مباشر يحقق طلب ربط معلّقاً لنفس المورد والمذخر — يُغلق كي لا يبقى
        // معلّقاً في صندوق الطلبات. طلب معلّق لمذخر آخر يبقى كما هو للمراجعة.
        // الربط كُتب فعلاً؛ فشل هذا الإغلاق لا يُحوّل نجاح الربط إلى خطأ 500.
        await prisma.supplierLinkRequest
            .updateMany({
                where: { supplierId: supplier.id, warehouseId: warehouse.id, status: 'PENDING' },
                data: {
                    status: 'APPROVED',
                    pendingKey: null,
                    decidedAt: new Date(),
                    decidedById: gate.user.id || 'unknown',
                    decidedByName: gate.user.name || gate.user.email || 'SUPER_ADMIN',
                    decisionNote: 'رُبط مباشرة من نافذة ربط الموردين.',
                },
            })
            .catch((e) => console.error('supplier-links: failed to close pending link requests:', e));

        await logAudit({
            userId: gate.user.id || 'unknown',
            userName: gate.user.name || gate.user.email || 'SUPER_ADMIN',
            action: 'LINK',
            entity: 'SUPPLIER',
            entityId: supplier.id,
            details: JSON.stringify({
                supplierName: supplier.name,
                organizationId,
                organizationName: organization.name,
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                previousWarehouseId: null,
                newWarehouseId: warehouse.id,
            }),
        });

        return NextResponse.json({ ok: true, supplier: { ...supplier, warehouseId: warehouse.id } });
    } catch (e: any) {
        // القيد الفريد هو الحكم النهائي (§173) — يُترجم إلى 409 لا 500.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'هذه المؤسسة تربط هذا المذخر بمورد آخر بالفعل.', code: 'CONFLICT_WAREHOUSE_HAS_SUPPLIER' },
                { status: 409 }
            );
        }
        console.error('supplier-links POST error:', e);
        return NextResponse.json({ error: 'فشل في ربط المورد' }, { status: 500 });
    }
}
