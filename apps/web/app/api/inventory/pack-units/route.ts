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
import { logAudit } from '@/app/lib/audit';

/**
 * تصحيح عدد مؤكَّد لمدير الصيدلية وحده. الرقم مشترك بين كل الصيدليات، فالشرط
 * على الدور نفسه لا على صلاحية قابلة للمنح (canAddDrug تُمنح لصيدلاني أيضاً).
 * MANAGER قيمة قديمة يعاملها tenant-utils مديراً. مدير النظام (SUPER_ADMIN)
 * مستبعد: لا نطاق صيدلية له هنا.
 */
function canCorrectPackUnits(role: string): boolean {
    return role === 'ADMIN' || role === 'MANAGER';
}

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
        // إزاحة لا رقم صفحة: التأكيد يُخرج الدواء من قائمة غير المؤكَّدة، فتتقدّم
        // الصفوف التالية. الصفحة تحسب الإزاحة على القائمة الحية فلا يُتخطّى دواء.
        const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
        // status=confirmed يعرض ما حُسم للاطلاع (الرقم وتاريخه)، لا للتعديل:
        // الحفظ أدناه يرفض دهس تأكيد سابق.
        const showConfirmed = searchParams.get('status') === 'confirmed';
        const canCorrect = canCorrectPackUnits(tenantCtx.user.role);

        // عدد الأدوية (لا صفوف الفروع) في كل حالة، لعدّادات التبويبات. بلا بحث
        // ولا مرشّح شكل، فيبقى العدد ثابتاً وأنت تبحث.
        const countDrugs = async (confirmed: boolean) =>
            (
                await prisma.inventory.findMany({
                    where: {
                        branchId: { in: scope.branchIds },
                        drug: { isActive: true, unitsPerPackConfirmedAt: confirmed ? { not: null } : null },
                    },
                    select: { drugId: true },
                    distinct: ['drugId'],
                })
            ).length;

        // أدوية لها صف مخزون في فروع النطاق ولم يُؤكَّد عدد أشرطتها (أو أُكِّد،
        // مع status=confirmed). الشرط على unitsPerPackConfirmedAt لا على
        // unitsPerPack: الرقم المستنتَج موجود وغير مُتحقَّق منه، وهو بالضبط ما
        // نريد عرضه للمراجعة.
        const [inventories, unconfirmedCount, confirmedCount] = await Promise.all([prisma.inventory.findMany({
            where: {
                branchId: { in: scope.branchIds },
                drug: {
                    unitsPerPackConfirmedAt: showConfirmed ? { not: null } : null,
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
                drug: {
                    select: { id: true, barcode: true, tradeName: true, unitsPerPack: true, unitsPerPackConfirmedAt: true },
                },
                batches: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
            },
        }), countDrugs(false), countDrugs(true)]);
        if (inventories.length === 0) {
            return NextResponse.json({
                items: [],
                total: 0,
                unconfirmedCount,
                confirmedCount,
                ...(showConfirmed ? {} : { singleUnitCount: 0 }),
                movementDays: MOVEMENT_DAYS,
                canCorrect,
            });
        }

        // دمج صفوف الفروع المتعددة لنفس الدواء: التعبئة خاصية بالدواء لا بالفرع،
        // فعرضه مرتين يضاعف العمل بلا فائدة.
        const byDrug = new Map<
            string,
            {
                id: string;
                barcode: string;
                tradeName: string;
                unitsPerPack: number | null;
                unitsPerPackConfirmedAt: Date | null;
                stock: number;
                sellPrice: number;
            }
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
                    /** متى أُكِّد العدد؛ null في قائمة غير المؤكَّدة. */
                    confirmedAt: d.unitsPerPackConfirmedAt,
                };
            })
            // غير المؤكَّدة: الحركة أولاً، ثم الرصيد — دواء نافد لم يُبَع منذ مدة
            // أقل إلحاحاً من دواء على الرف يُباع يومياً. المؤكَّدة: الأحدث تأكيداً
            // أولاً، فيراجع المستخدم ما حسمه للتو.
            .sort((a, b) =>
                showConfirmed
                    ? (b.confirmedAt?.getTime() ?? 0) - (a.confirmedAt?.getTime() ?? 0) || b.movement - a.movement
                    : b.movement - a.movement || b.stock - a.stock,
            );

        const filtered = !showConfirmed && formFilter === 'SINGLE'
            ? items.filter((d) => d.form === 'SINGLE_UNIT')
            : items;

        return NextResponse.json({
            items: filtered.slice(offset, offset + PAGE_SIZE),
            offset,
            pageSize: PAGE_SIZE,
            /** طول القائمة المعروضة بعد البحث والمرشّح (قد يتجاوز PAGE_SIZE). */
            total: filtered.length,
            unconfirmedCount,
            confirmedCount,
            /** إجمالي الوحدوية غير المؤكَّدة — يُظهِر حجم المكسب المتاح. */
            ...(showConfirmed ? {} : { singleUnitCount: items.filter((d) => d.form === 'SINGLE_UNIT').length }),
            movementDays: MOVEMENT_DAYS,
            /** يُظهر زر التصحيح في قائمة المؤكَّدة — القرار نفسه يُعاد في PATCH. */
            canCorrect,
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
        // دواء واحد ({drugId}) أو دفعة ({drugIds}) بنفس العدد، أو دفعة بقيم
        // مختلفة ({items: [{ drugId, unitsPerPack }]}). الصيغة الأخيرة تسمح
        // للمراجع بإدخال تعبئة مختلفة لكل دواء ثم حفظها بضغطة واحدة.
        const rawItems: unknown = Array.isArray(body?.items) ? body.items : [];
        const itemMap = new Map<string, number>();
        for (const item of rawItems as unknown[]) {
            if (!item || typeof item !== 'object') continue;
            const drugId = (item as { drugId?: unknown }).drugId;
            const value = Number((item as { unitsPerPack?: unknown }).unitsPerPack);
            if (typeof drugId === 'string' && drugId.length > 0) itemMap.set(drugId, value);
        }
        const rawIds: unknown = Array.isArray(body?.drugIds)
            ? body.drugIds
            : typeof body?.drugId === 'string'
                ? [body.drugId]
                : [];
        const uniformIds = Array.from(new Set(
            (rawIds as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
        ));
        const drugIds = itemMap.size > 0 ? Array.from(itemMap.keys()) : uniformIds;
        const uniformUnits = Number(body?.unitsPerPack);
        if (drugIds.length === 0) return NextResponse.json({ error: 'drugId مطلوب.' }, { status: 400 });
        if (drugIds.length > 500) {
            return NextResponse.json({ error: 'الحد الأقصى 500 دواء في الدفعة الواحدة.' }, { status: 400 });
        }
        if (itemMap.size === 0 && (!Number.isInteger(uniformUnits) || uniformUnits <= 0)) {
            return NextResponse.json(
                { error: 'عدد الأشرطة يجب أن يكون عدداً صحيحاً أكبر من صفر.' },
                { status: 400 }
            );
        }
        const values = drugIds.map((id) => itemMap.size > 0 ? itemMap.get(id) : uniformUnits);
        if (values.some((value) => !Number.isInteger(value) || (value as number) <= 0)) {
            return NextResponse.json({ error: 'كل أعداد الأشرطة يجب أن تكون أعداداً صحيحة أكبر من صفر.' }, { status: 400 });
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
        const valuesById = new Map(drugIds.map((id, index) => [id, values[index] as number]));
        const now = new Date();
        const counts = await prisma.$transaction(
            ownedIds.map((id) => prisma.globalDrug.updateMany({
                where: { id, unitsPerPackConfirmedAt: null },
                data: { unitsPerPack: valuesById.get(id)!, unitsPerPackConfirmedAt: now },
            })),
        );
        const writtenCount = counts.reduce((sum, result) => sum + result.count, 0);
        return NextResponse.json({
            ok: true,
            confirmed: writtenCount,
            skipped: drugIds.length - writtenCount,
        });
    } catch (e) {
        console.error('inventory pack-units POST error:', e);
        return NextResponse.json({ error: 'فشل في حفظ عدد الأشرطة' }, { status: 500 });
    }
}

/**
 * تصحيح عدد أشرطة مؤكَّد سابقاً — لمدير الصيدلية وحده (انظر canCorrectPackUnits).
 *
 * الجسم: { drugId, unitsPerPack, expected }. expected هو الرقم الذي رآه المدير
 * على الشاشة؛ إن تغيّر في القاعدة منذ ذلك (صحّحه غيره) يُرفض التصحيح بـ409 بدل
 * أن يدهس قراراً أحدث لم يره. غير المؤكَّد لا يُصحَّح هنا — يُؤكَّد عبر POST.
 */
export async function PATCH(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!canCorrectPackUnits(tenantCtx.user.role)) {
        return NextResponse.json({ error: 'تصحيح عدد الأشرطة المؤكَّد متاح لمدير الصيدلية فقط.' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const drugId = typeof body?.drugId === 'string' ? body.drugId : '';
        const unitsPerPack = Number(body?.unitsPerPack);
        const expected = Number(body?.expected);
        if (!drugId) return NextResponse.json({ error: 'drugId مطلوب.' }, { status: 400 });
        if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0 || !Number.isInteger(expected) || expected <= 0) {
            return NextResponse.json({ error: 'عدد الأشرطة يجب أن يكون عدداً صحيحاً أكبر من صفر.' }, { status: 400 });
        }
        if (unitsPerPack === expected) {
            return NextResponse.json({ error: 'العدد الجديد مطابق للحالي.' }, { status: 400 });
        }

        // الصف عالمي تراه كل المؤسسات، فيُشترط أن يكون الدواء في مخزون فروع المدير.
        const scope = await resolveHistoryScope(tenantCtx);
        if (!scope) return NextResponse.json({ error: 'لا يوجد نطاق مؤسسة صالح.' }, { status: 403 });
        const owned = await prisma.inventory.findFirst({
            where: { drugId, branchId: { in: scope.branchIds } },
            select: { branchId: true, drug: { select: { tradeName: true, unitsPerPackConfirmedAt: true } } },
        });
        if (!owned) return NextResponse.json({ error: 'هذا الدواء ليس في مخزونك.' }, { status: 404 });

        const now = new Date();
        const { count } = await prisma.globalDrug.updateMany({
            where: { id: drugId, unitsPerPackConfirmedAt: { not: null }, unitsPerPack: expected },
            data: { unitsPerPack, unitsPerPackConfirmedAt: now },
        });
        if (count === 0) {
            return NextResponse.json(
                { error: 'تغيّر عدد الأشرطة لهذا الدواء منذ فتح الصفحة، أو لم يعد مؤكَّداً. حدّث الصفحة ثم أعد المحاولة.' },
                { status: 409 },
            );
        }

        // الفرع من صف المخزون، فيظهر القيد في سجل الصيدلية عند التصفية بالفرع.
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'غير معروف',
            action: 'PACK_UNITS_CORRECTION',
            entity: 'DRUG',
            entityId: drugId,
            details: JSON.stringify({
                tradeName: owned.drug.tradeName,
                from: expected,
                to: unitsPerPack,
                previousConfirmedAt: owned.drug.unitsPerPackConfirmedAt?.toISOString() ?? null,
            }),
            branchId: owned.branchId,
        });

        return NextResponse.json({ ok: true, unitsPerPack, confirmedAt: now.toISOString() });
    } catch (e) {
        console.error('inventory pack-units PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تصحيح عدد الأشرطة' }, { status: 500 });
    }
}
