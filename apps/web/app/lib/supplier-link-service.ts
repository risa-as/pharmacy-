// كتابة ربط مورد بمذخر — مشتركة بين الربط المباشر من نافذة المذاخر واعتماد طلب
// ربط رفعته مؤسسة. مستخرجة من admin/warehouses/[id]/supplier-links/route.ts كي لا
// يتفرّع المساران في فحص أو رسالة. البوابة (SUPER_ADMIN) وسطر التدقيق عند المستدعي.
import type { Prisma, PrismaClient } from '@prisma/client';
import { decideSupplierLink, isLinkConflict } from './supplier-warehouse-link';

type Db = PrismaClient | Prisma.TransactionClient;

export type LinkOutcome =
    | {
          ok: true;
          alreadyLinked: boolean;
          supplier: { id: string; name: string; organizationId: string | null; warehouseId: string | null };
          warehouse: { id: string; name: string };
          organization: { id: string; name: string };
      }
    | { ok: false; status: number; code?: string; error: string };

export async function linkSupplierToWarehouse(
    db: Db,
    input: { warehouseId: string; organizationId: string; supplierId: string }
): Promise<LinkOutcome> {
    const { warehouseId, organizationId, supplierId } = input;

    const [warehouse, organization, supplier] = await Promise.all([
        db.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true } }),
        db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
        db.supplier.findUnique({
            where: { id: supplierId },
            select: { id: true, name: true, organizationId: true, warehouseId: true },
        }),
    ]);

    if (!warehouse) return { ok: false, status: 404, error: 'المذخر غير موجود' };
    if (!organization) return { ok: false, status: 404, error: 'المؤسسة غير موجودة' };
    if (!supplier) return { ok: false, status: 404, error: 'المورد غير موجود' };

    const existingLinkForWarehouse = await db.supplier.findFirst({
        where: { organizationId, warehouseId: warehouse.id },
        select: { id: true, name: true },
    });

    const decision = decideSupplierLink({ supplier, warehouseId: warehouse.id, organizationId, existingLinkForWarehouse });

    if (decision.action === 'WRONG_ORG') {
        return { ok: false, status: 400, error: decision.reason ?? 'المورد لا يتبع المؤسسة.' };
    }
    if (isLinkConflict(decision.action)) {
        return { ok: false, status: 409, code: decision.action, error: decision.reason ?? 'تعارض في الربط.' };
    }
    // تكرار الربط نفسه يعيد نجاحاً بلا أثر إضافي (§174).
    if (decision.action === 'ALREADY_LINKED') {
        return { ok: true, alreadyLinked: true, supplier, warehouse, organization };
    }

    // updateMany بشرط warehouseId: null هو الحارس ضد السباق: لو ربط طلبٌ
    // متزامنٌ هذا المورد بين قراءتنا وكتابتنا، فالعدد يعود 0 ولا نكتب فوقه.
    const written = await db.supplier.updateMany({
        where: { id: supplier.id, organizationId, warehouseId: null },
        data: { warehouseId: warehouse.id },
    });
    if (written.count === 0) {
        return {
            ok: false,
            status: 409,
            code: 'RACE',
            error: 'تغيّرت حالة هذا المورد للتو من عملية أخرى — أعد فتح النافذة وحدّث البيانات.',
        };
    }

    return { ok: true, alreadyLinked: false, supplier: { ...supplier, warehouseId: warehouse.id }, warehouse, organization };
}

/** رسالة القيد الفريد (§173) — تُترجم إلى 409 لا 500. */
export const LINK_UNIQUE_CONFLICT = {
    error: 'هذه المؤسسة تربط هذا المذخر بمورد آخر بالفعل.',
    code: 'CONFLICT_WAREHOUSE_HAS_SUPPLIER',
} as const;
