export const dynamic = 'force-dynamic';

// مشتريات المذخر وذممه الدائنة: تسجيل فاتورة شراء واردة من مورّد. هذا هو
// المسار السليم للاستلام من الآن فصاعداً — ينشئ WarehousePurchase وبنودها
// و**دفعة مخزون واحدة (WarehouseBatch) لكل بند** داخل معاملة واحدة، بلا
// حاجة لخطوة استلام منفصلة بعدها. POST /api/warehouse-portal/stock/receipt
// يبقى قائماً بجانبه للأرصدة الافتتاحية والتصحيحات اليدوية التي لا فاتورة
// شراء خلفها.
//
// total يُحسَب دائماً على الخادم من البنود (computePurchaseTotal) — لا يُقبَل
// من جسم الطلب مباشرة. status يُشتق عبر computeInvoiceStatus من
// app/lib/warehouse-accounts.ts حرفياً (نفس الدالة المستخدَمة لفواتير البيع،
// نقيّة تماماً من اتجاه العلاقة) — لا نسخة موازية لها هنا.
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canCreatePurchase.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { computeInvoiceStatus, computeDueDate } from '@/app/lib/warehouse-accounts';
import { computePurchaseTotal, purchaseStockUnits, validatePurchaseLine } from '@/app/lib/warehouse-purchases';
import { warehousePage } from '@/app/lib/warehouse-pagination';
import { agingBucket } from '@/app/lib/warehouse-accounts';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    const gate = await requireWarehousePermission(ctx, 'canViewPurchases');
    if (!gate.ok) return gate.response;
    const params = new URL(req.url).searchParams;
    const pagination = warehousePage(params);
    const status = params.get('status'), search = params.get('search')?.trim();
    if (status && !['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'].includes(status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });
    const where: Prisma.WarehousePurchaseWhereInput = { warehouseId: ctx.warehouseId,
        ...(status ? { status: status as any } : {}),
        ...(search ? { OR: [{ supplier: { name: { contains: search, mode: 'insensitive' } } }, { invoiceNumber: { contains: search, mode: 'insensitive' } }] } : {}) };
    const [rows, total] = await prisma.$transaction([prisma.warehousePurchase.findMany({ where,
        include: { supplier: { select: { name: true } }, _count: { select: { payments: true, items: true } } },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], take: pagination.take, skip: pagination.skip }), prisma.warehousePurchase.count({ where })]);
    return NextResponse.json({ purchases: rows.map(p => ({ ...p, supplierName: p.supplier.name, remaining: Math.max(p.total-p.paidAmount,0),
        aging: agingBucket(p.dueAt, new Date()), itemsCount: p._count.items, paymentsCount: p._count.payments })), total, page: pagination.page, pageSize: pagination.pageSize });
}

interface RawLine {
    catalogItemId?: unknown;
    batchNumber?: unknown;
    expiryDate?: unknown;
    quantity?: unknown;
    unitCost?: unknown;
    bonusQuantity?: unknown;
}

// POST: تسجيل فاتورة شراء —
// { supplierId, invoiceNumber, issuedAt?, paymentTermDays?, notes?, lines: [{ catalogItemId, batchNumber, expiryDate, quantity, unitCost, bonusQuantity? }] }
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canCreatePurchase');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const supplierId: string | undefined = body.supplierId;
        const invoiceNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : '';
        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
        const rawLines: RawLine[] = Array.isArray(body.lines) ? body.lines : [];

        if (!supplierId || typeof supplierId !== 'string') {
            return NextResponse.json({ error: 'المورّد مطلوب' }, { status: 400 });
        }
        if (!invoiceNumber) {
            return NextResponse.json({ error: 'رقم فاتورة المورّد مطلوب' }, { status: 400 });
        }
        if (rawLines.length === 0) {
            return NextResponse.json({ error: 'يجب أن تحتوي الفاتورة على بند واحد على الأقل' }, { status: 400 });
        }

        let issuedAt = new Date();
        if (body.issuedAt !== undefined && body.issuedAt !== null) {
            const d = new Date(body.issuedAt);
            if (Number.isNaN(d.getTime())) {
                return NextResponse.json({ error: 'تاريخ إصدار الفاتورة غير صالح' }, { status: 400 });
            }
            issuedAt = d;
        }

        let dueAt: Date | null = null;
        if (body.paymentTermDays !== undefined && body.paymentTermDays !== null) {
            const term = Number(body.paymentTermDays);
            if (!Number.isInteger(term) || term < 0) {
                return NextResponse.json({ error: 'مهلة السداد يجب أن تكون عدداً صحيحاً غير سالب.' }, { status: 400 });
            }
            dueAt = computeDueDate(issuedAt, term);
        } else if (body.dueAt !== undefined && body.dueAt !== null) {
            const d = new Date(body.dueAt);
            if (Number.isNaN(d.getTime())) {
                return NextResponse.json({ error: 'تاريخ الاستحقاق غير صالح' }, { status: 400 });
            }
            dueAt = d;
        }

        // المورّد يجب أن ينتمي لمذخر الفاعل حصراً.
        const supplier = await prisma.warehouseSupplier.findFirst({
            where: { id: supplierId, warehouseId: ctx.warehouseId },
            select: { id: true, name: true },
        });
        if (!supplier) {
            return NextResponse.json({ error: 'المورّد غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        // تحقّق كل بند قبل أي كتابة — الأخطاء تُجمَّع كلها (لا فشل عند أول خطأ)
        // كي يصحّح المذخر كل بنوده دفعة واحدة، مطابقاً لأسلوب
        // app/api/purchases/[id]/receive/route.ts.
        const validationErrors: string[] = [];
        const now = new Date();
        const lines: {
            catalogItemId: string;
            batchNumber: string;
            expiryDate: Date;
            quantity: number;
            unitCost: number;
            bonusQuantity: number;
        }[] = [];

        rawLines.forEach((line, index) => {
            const label = `السطر رقم ${index + 1}`;
            const catalogItemId = typeof line.catalogItemId === 'string' ? line.catalogItemId : '';
            const batchNumber = typeof line.batchNumber === 'string' ? line.batchNumber.trim() : '';
            const quantity = Number(line.quantity);
            const unitCost = Number(line.unitCost);
            const bonusQuantity = line.bonusQuantity === undefined || line.bonusQuantity === null ? 0 : Number(line.bonusQuantity);
            const expiryDate = line.expiryDate ? new Date(line.expiryDate as any) : null;

            if (!catalogItemId) {
                validationErrors.push(`${label}: الصنف مطلوب.`);
                return;
            }
            if (!batchNumber) {
                validationErrors.push(`${label}: رقم الدفعة مطلوب.`);
                return;
            }
            if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
                validationErrors.push(`${label}: تاريخ انتهاء غير صالح.`);
                return;
            }

            const check = validatePurchaseLine({ quantity, unitCost, bonusQuantity, expiryDate }, now);
            if (!check.ok) {
                validationErrors.push(`${label}: ${check.error}`);
                return;
            }

            lines.push({ catalogItemId, batchNumber, expiryDate, quantity, unitCost, bonusQuantity });
        });

        if (validationErrors.length > 0) {
            return NextResponse.json({ error: 'بيانات فاتورة الشراء غير صالحة', errors: validationErrors }, { status: 400 });
        }

        // ملكية الأصناف: يجب أن تنتمي كلها لكتالوج مذخر الفاعل حصراً.
        const catalogItemIds = Array.from(new Set(lines.map((l) => l.catalogItemId)));
        const catalogItems = await prisma.warehouseCatalogItem.findMany({
            where: { id: { in: catalogItemIds }, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (catalogItems.length !== catalogItemIds.length) {
            return NextResponse.json({ error: 'صنف واحد أو أكثر غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        // الإجمالي يُحسَب هنا حصراً — لا يُقبَل من جسم الطلب إطلاقاً.
        const total = computePurchaseTotal(lines);
        const status = computeInvoiceStatus({ total, paidAmount: 0 });

        const created = await prisma.$transaction(async (tx) => {
            const purchase = await tx.warehousePurchase.create({
                data: {
                    warehouseId: ctx.warehouseId,
                    supplierId: supplier.id,
                    invoiceNumber,
                    total,
                    paidAmount: 0,
                    status,
                    issuedAt,
                    dueAt,
                    notes,
                },
            });

            for (const line of lines) {
                const purchaseItem = await tx.warehousePurchaseItem.create({
                    data: {
                        purchaseId: purchase.id,
                        catalogItemId: line.catalogItemId,
                        batchNumber: line.batchNumber,
                        expiryDate: line.expiryDate,
                        quantity: line.quantity,
                        unitCost: line.unitCost,
                        bonusQuantity: line.bonusQuantity,
                    },
                });

                // وحدات المخزون الفعلية = مدفوعة + بونص معاً (كلاهما بضاعة
                // حقيقية تدخل الرفوف) — لكن total الفاتورة أعلاه حسب المدفوعة فقط.
                const stockUnits = purchaseStockUnits({ quantity: line.quantity, bonusQuantity: line.bonusQuantity });

                const batch = await tx.warehouseBatch.create({
                    data: {
                        catalogItemId: line.catalogItemId,
                        batchNumber: line.batchNumber,
                        expiryDate: line.expiryDate,
                        quantity: stockUnits,
                        initialQuantity: stockUnits,
                        costPrice: stockUnits > 0 ? line.quantity * line.unitCost / stockUnits : 0,
                        supplierName: supplier.name,
                        purchaseItemId: purchaseItem.id,
                    },
                });

                await tx.warehouseStockMove.create({
                    data: {
                        catalogItemId: line.catalogItemId,
                        batchId: batch.id,
                        type: 'RECEIPT',
                        quantity: stockUnits,
                        reason: `شراء — فاتورة ${invoiceNumber}`,
                        actorName: ctx.user.name ?? ctx.user.email ?? null,
                    },
                });

                // استراتيجية آخر كلفة (last-cost) — فقط إن كانت كلفة السطر
                // موجبة فعلاً. بند بونص كامل السطر (unitCost = 0) لا يجوز أن
                // يصفّر كلفة الكتالوج المرجعية — هذا بالضبط الخطأ الذي أفسد
                // بيانات ثلاثة أشهر سابقاً في هذا المشروع عند تجاهل هذا
                // الاستثناء (انظر نفس الحماية في
                // app/api/purchases/[id]/receive/route.ts عند تحديث Inventory.cost).
                if (line.unitCost > 0) {
                    await tx.warehouseCatalogItem.update({
                        where: { id: line.catalogItemId },
                        data: { costPrice: line.unitCost },
                    });
                }
            }

            return tx.warehousePurchase.findUniqueOrThrow({
                where: { id: purchase.id },
                include: { items: true, supplier: { select: { name: true } } },
            });
        });

        return NextResponse.json({ purchase: created }, { status: 201 });
    } catch (e: any) {
        // @@unique([warehouseId, supplierId, invoiceNumber]) — نفس رقم الفاتورة
        // مسجَّل بالفعل لهذا المورّد تحديداً لدى هذا المذخر.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'توجد فاتورة شراء بنفس الرقم مسجَّلة بالفعل لهذا المورّد.' },
                { status: 409 }
            );
        }
        console.error('warehouse-portal purchases POST error:', e);
        return NextResponse.json({ error: 'فشل في تسجيل فاتورة الشراء' }, { status: 500 });
    }
}
