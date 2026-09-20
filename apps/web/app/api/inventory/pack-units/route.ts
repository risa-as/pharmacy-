export const dynamic = 'force-dynamic';

// ميزة وحدة التسعير: أدوية لم يُؤكَّد عدد أشرطتها بعد، مرتّبة بحركتها.
//
// سبب وجودها: التأكيد يحدث طبيعياً عند إضافة دفعة — وهي اللحظة التي يمسك فيها
// الصيدلاني العلبة. لكن كثيراً من الأدوية لا يُطلب إلا مرة كل شهرين، فالانتظار
// وحده يترك أهم الأصناف بلا تعبئة مؤكَّدة لفصول. هذه الصفحة تتيح حسم المهم
// مبكراً، والترتيب بالحركة هو ما يجعل «المهم» معرَّفاً بالبيع لا بالانطباع.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { resolveHistoryScope } from '@/app/lib/supplier-price-history';
import { toPacketPrice } from '@/app/lib/pack-units';
import { classifyDosageForm } from '@/app/lib/dosage-form';

/** نافذة قياس الحركة — ربع سنة يغطّي الأدوية الموسمية دون أن يغرق في القديم. */
const MOVEMENT_DAYS = 90;
const PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const scope = await resolveHistoryScope(tenantCtx);
        if (!scope) return NextResponse.json({ error: 'لا يوجد نطاق مؤسسة صالح.' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const query = (searchParams.get('query') || '').trim().slice(0, 100);
        // مرشّح الشكل الصيدلاني: SINGLE يعرض ما تعبئته 1 يقيناً (زجاجة،
        // أنبوب، قطرة) — مراجعتها تدقيق لا إدخال، فتُحسم دفعة واحدة.
        const formFilter = searchParams.get('form');

        // أدوية لها صف مخزون في فروع النطاق ولم يُؤكَّد عدد أشرطتها.
        // الشرط على unitsPerPackConfirmedAt لا على unitsPerPack: الرقم المستنتَج
        // موجود وغير مُتحقَّق منه، وهو بالضبط ما نريد عرضه للمراجعة.
        const inventories = await prisma.inventory.findMany({
            where: {
                branchId: { in: scope.branchIds },
                drug: {
                    unitsPerPackConfirmedAt: null,
                    isActive: true,
                    ...(query
                        ? {
                              OR: [
                                  { tradeName: { contains: query, mode: 'insensitive' as const } },
                                  { barcode: { contains: query } },
                              ],
                          }
                        : {}),
                },
            },
            select: {
                price: true,
                drug: { select: { id: true, barcode: true, tradeName: true, unitsPerPack: true } },
                batches: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
            },
        });
        if (inventories.length === 0) return NextResponse.json({ items: [], totalUnconfirmed: 0 });

        // دمج صفوف الفروع المتعددة لنفس الدواء: التعبئة خاصية بالدواء لا بالفرع،
        // فعرضه مرتين يضاعف العمل بلا فائدة.
        const byDrug = new Map<
            string,
            { id: string; barcode: string; tradeName: string; unitsPerPack: number | null; stock: number; sellPrice: number }
        >();
        for (const inv of inventories) {
            const stock = inv.batches.reduce((s, b) => s + b.quantity, 0);
            const prev = byDrug.get(inv.drug.id);
            if (prev) {
                prev.stock += stock;
                prev.sellPrice = prev.sellPrice || inv.price;
            } else {
                byDrug.set(inv.drug.id, { ...inv.drug, stock, sellPrice: inv.price });
            }
        }
        const drugIds = Array.from(byDrug.keys());

        const since = new Date(Date.now() - MOVEMENT_DAYS * 24 * 60 * 60 * 1000);
        const [sold, lastBatches] = await Promise.all([
            prisma.saleItem.groupBy({
                by: ['drugId'],
                where: {
                    drugId: { in: drugIds },
                    sale: { branchId: { in: scope.branchIds }, createdAt: { gte: since } },
                },
                _sum: { quantity: true },
            }),
            // آخر كلفة لكل دواء — سعر شريط. تُستعمل لعرض سعر الباكيت المشتق حين
            // يوجد رقم مقترَح، فيرى المراجع الرقمين معاً ويحكم عليهما.
            prisma.batch.findMany({
                where: {
                    inventory: { drugId: { in: drugIds }, branchId: { in: scope.branchIds } },
                    costPrice: { gt: 0 },
                },
                orderBy: { createdAt: 'desc' },
                select: { costPrice: true, createdAt: true, inventory: { select: { drugId: true } } },
            }),
        ]);

        const movement = new Map(sold.map((s) => [s.drugId, s._sum.quantity ?? 0]));
        const lastCost = new Map<string, number>();
        for (const b of lastBatches) {
            if (!lastCost.has(b.inventory.drugId)) lastCost.set(b.inventory.drugId, b.costPrice);
        }

        const items = Array.from(byDrug.values())
            .map((d) => {
                const cost = lastCost.get(d.id) ?? null;
                return {
                    drugId: d.id,
                    barcode: d.barcode,
                    tradeName: d.tradeName,
                    /** الشكل الصيدلاني المستنبَط من الاسم — انظر app/lib/dosage-form.ts. */
                    form: classifyDosageForm(d.tradeName),
                    /** الرقم المستنتَج من الدفعات القديمة — مقترَح لا مؤكَّد. */
                    suggestedUnitsPerPack: d.unitsPerPack,
                    movement: movement.get(d.id) ?? 0,
                    stock: d.stock,
                    sellPrice: d.sellPrice,
                    lastStripCost: cost,
                    derivedPacketPrice: cost !== null ? toPacketPrice(cost, d.unitsPerPack) : null,
                };
            })
            // الحركة أولاً، ثم الرصيد: دواء نافد لم يُبَع منذ مدة أقل إلحاحاً من
            // دواء على الرف يُباع يومياً.
            .sort((a, b) => b.movement - a.movement || b.stock - a.stock);

        const filtered = formFilter === 'SINGLE'
            ? items.filter((d) => d.form === 'SINGLE_UNIT')
            : items;

        return NextResponse.json({
            items: filtered.slice(0, PAGE_SIZE),
            totalUnconfirmed: filtered.length,
            /** إجمالي الوحدوية مهما كان المرشّح — يُظهِر حجم المكسب المتاح. */
            singleUnitCount: items.filter((d) => d.form === 'SINGLE_UNIT').length,
            movementDays: MOVEMENT_DAYS,
        });
    } catch (e) {
        console.error('inventory pack-units GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب الأدوية غير المؤكَّدة' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.userPermissions.canAddDrug) {
        return NextResponse.json({ error: 'ليس لديك صلاحية تعديل بيانات الأدوية.' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        // دواء واحد ({drugId}) أو دفعة ({drugIds}) بنفس العدد. الدفعة لحالة
        // واحدة محددة: الأشكال الوحدوية رقمها 1 معروف سلفاً، فالمراجعة تدقيق.
        const rawIds: unknown = Array.isArray(body?.drugIds)
            ? body.drugIds
            : typeof body?.drugId === 'string'
                ? [body.drugId]
                : [];
        const drugIds = Array.from(new Set(
            (rawIds as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
        ));
        const unitsPerPack = Number(body?.unitsPerPack);
        if (drugIds.length === 0) return NextResponse.json({ error: 'drugId مطلوب.' }, { status: 400 });
        if (drugIds.length > 500) {
            return NextResponse.json({ error: 'الحد الأقصى 500 دواء في الدفعة الواحدة.' }, { status: 400 });
        }
        if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0) {
            return NextResponse.json(
                { error: 'عدد الأشرطة يجب أن يكون عدداً صحيحاً أكبر من صفر.' },
                { status: 400 }
            );
        }

        // الكتابة تمسّ صفاً عالمياً تراه كل المؤسسات، فيُشترط أن يكون الدواء في
        // مخزون فروع الطالب فعلاً — لا يكفي أن يرسل معرّفاً صالحاً.
        const scope = await resolveHistoryScope(tenantCtx);
        if (!scope) return NextResponse.json({ error: 'لا يوجد نطاق مؤسسة صالح.' }, { status: 403 });
        // استعلام واحد لكل المعرّفات: يحدّد ما يملكه الطالب فعلاً، وما عداه
        // يُتجاهَل بلا إفشال الدفعة كلها — معرّف واحد غريب لا يلغي عمل مائة صحيحة.
        const owned = await prisma.inventory.findMany({
            where: { drugId: { in: drugIds }, branchId: { in: scope.branchIds } },
            select: { drugId: true },
            distinct: ['drugId'],
        });
        const ownedIds = owned.map((o) => o.drugId);
        if (ownedIds.length === 0) {
            return NextResponse.json({ error: 'هذا الدواء ليس في مخزونك.' }, { status: 404 });
        }

        // الشرط على unitsPerPackConfirmedAt: null يمنع دهس تأكيد سابق — لو أكّد
        // صيدلاني آخر رقماً بين فتح الصفحة والحفظ، فتأكيده أولى من دفعة جماعية.
        const written = await prisma.globalDrug.updateMany({
            where: { id: { in: ownedIds }, unitsPerPackConfirmedAt: null },
            data: { unitsPerPack, unitsPerPackConfirmedAt: new Date() },
        });
        return NextResponse.json({
            ok: true,
            unitsPerPack,
            confirmed: written.count,
            skipped: drugIds.length - written.count,
        });
    } catch (e) {
        console.error('inventory pack-units POST error:', e);
        return NextResponse.json({ error: 'فشل في حفظ عدد الأشرطة' }, { status: 500 });
    }
}
