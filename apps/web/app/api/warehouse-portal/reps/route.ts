export const dynamic = 'force-dynamic';

// المندوبون (مذاخر B2B): قائمة مندوبي مذخر الفاعل + إنشاء مندوب جديد.
// GET يُرفق لكل مندوب قيمة بضاعة سيارته الحالية (vanValue، مُشتقّة من
// WarehouseRepStock × WarehouseBatch.costPrice — لا من سعر البيع) وأداءه
// المالي خلال الفترة المطلوبة (from/to، افتراضياً نفس نافذة التقارير
// القياسية عبر resolveReportDateRange) + عمولته المحسوبة عبر computeCommission
// من app/lib/warehouse-reps.ts — بلا أي حساب موازٍ هنا.
// Phase 3 (الأدوار والصلاحيات): GET يتطلب canViewReps، POST يتطلب canManageReps
// (كلاهما يتطلب canViewReps أصلاً حسب المصفوفة — لا حاجة لفحص إضافي).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getRepPerformance, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { computeCommission, type CommissionBasisValue } from '@/app/lib/warehouse-reps';

const COMMISSION_BASES: CommissionBasisValue[] = ['SALES', 'PROFIT', 'COLLECTION'];

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReps');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));

        const reps = await prisma.warehouseRep.findMany({
            where: { warehouseId: ctx.warehouseId },
            orderBy: { name: 'asc' },
        });

        const [stockRows, performance] = await Promise.all([
            prisma.warehouseRepStock.findMany({
                where: { repId: { in: reps.map((r) => r.id) } },
                select: { repId: true, quantity: true, batch: { select: { costPrice: true } } },
            }),
            // مصدر مشترك مع GET /api/warehouse-portal/reports/reps — انظر
            // تعليق getRepPerformance في warehouse-report-data.ts.
            getRepPerformance(ctx.warehouseId, range),
        ]);

        const vanValueByRep = new Map<string, number>();
        const vanUnitsByRep = new Map<string, number>();
        for (const s of stockRows) {
            vanValueByRep.set(s.repId, (vanValueByRep.get(s.repId) ?? 0) + s.quantity * s.batch.costPrice);
            vanUnitsByRep.set(s.repId, (vanUnitsByRep.get(s.repId) ?? 0) + s.quantity);
        }
        const performanceByRep = new Map(performance.map((p) => [p.repId, p]));

        const result = reps.map((rep) => {
            const perf = performanceByRep.get(rep.id);
            const salesTotal = perf?.salesTotal ?? 0;
            const profitTotal = perf?.profitTotal ?? 0;
            const collectedTotal = perf?.collectedTotal ?? 0;
            const commission = computeCommission({
                basis: rep.commissionBasis as CommissionBasisValue,
                rate: rep.commissionRate,
                salesTotal,
                profitTotal,
                collectedTotal,
            });

            return {
                id: rep.id,
                userId: rep.userId,
                name: rep.name,
                phone: rep.phone,
                commissionBasis: rep.commissionBasis,
                commissionRate: rep.commissionRate,
                isActive: rep.isActive,
                createdAt: rep.createdAt,
                vanValue: vanValueByRep.get(rep.id) ?? 0,
                vanUnits: vanUnitsByRep.get(rep.id) ?? 0,
                period: { from: range.from.toISOString(), to: range.to.toISOString() },
                salesTotal,
                profitTotal,
                collectedTotal,
                commission,
            };
        });

        return NextResponse.json({ reps: result });
    } catch (e: any) {
        console.error('warehouse-portal reps GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة المندوبين' }, { status: 500 });
    }
}

// POST: إنشاء مندوب جديد — { name, phone?, commissionBasis?, commissionRate?, userId? }
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canManageReps');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
            return NextResponse.json({ error: 'اسم المندوب مطلوب' }, { status: 400 });
        }

        const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;

        let commissionBasis: CommissionBasisValue = 'SALES';
        if (body.commissionBasis !== undefined && body.commissionBasis !== null) {
            if (!COMMISSION_BASES.includes(body.commissionBasis)) {
                return NextResponse.json(
                    { error: 'نمط العمولة يجب أن يكون أحد: SALES أو PROFIT أو COLLECTION.' },
                    { status: 400 }
                );
            }
            commissionBasis = body.commissionBasis;
        }

        let commissionRate = 0;
        if (body.commissionRate !== undefined && body.commissionRate !== null) {
            const v = Number(body.commissionRate);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: 'نسبة العمولة يجب أن تكون رقماً غير سالب.' }, { status: 400 });
            }
            commissionRate = v;
        }

        let userId: string | null = null;
        if (body.userId !== undefined && body.userId !== null) {
            if (typeof body.userId !== 'string' || !body.userId) {
                return NextResponse.json({ error: 'معرّف حساب الدخول غير صالح.' }, { status: 400 });
            }
            const user = await prisma.user.findFirst({
                where: { id: body.userId, warehouseId: ctx.warehouseId },
                select: { id: true },
            });
            if (!user) {
                return NextResponse.json({ error: 'حساب الدخول غير موجود ضمن هذا المذخر.' }, { status: 404 });
            }
            userId = user.id;
        }

        const rep = await prisma.warehouseRep.create({
            data: { warehouseId: ctx.warehouseId, name, phone, commissionBasis, commissionRate, userId },
        });

        return NextResponse.json({ rep }, { status: 201 });
    } catch (e: any) {
        // @@unique([userId]) — هذا الحساب مرتبط بمندوب آخر بالفعل.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'حساب الدخول هذا مرتبط بمندوب آخر بالفعل — كل حساب دخول يخدم مندوباً واحداً فقط.' },
                { status: 409 }
            );
        }
        console.error('warehouse-portal reps POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء المندوب' }, { status: 500 });
    }
}
