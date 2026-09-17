// المرحلة 2 من ميزة «طلب الأدوية حسب الاحتياج»: طبقة بيانات تاريخ أسعار الموردين.
//
// سياسة المصادر (§4.2) مطبَّقة حرفياً:
//   1. الدفعات ذات المورد المعروف هي المصدر الأساسي لكل زوج (دواء، مورد).
//   2. إن لم يوجد سجل دفعة لذلك الزوج، يُستعمل بند فاتورة COMPLETED كبديل.
//      PENDING والملغاة مستبعدة تماماً.
//   3. لا يُدمج المصدران في سلسلة زمنية واحدة: البديل لا يُستعمل إلا للأزواج التي
//      لا دفعة لها أصلاً، فلا يظهر مصدران لنفس المورد كأنهما عمليتا شراء متتاليتان.
//
// قيد معروف يجب ذكره في الواجهة (§124): هذه سياسة «آخر سعر مسجَّل مؤهل» وليست
// إثباتاً لآخر شراء فعلي. الدفعات قابلة للحذف، و`Batch.createdAt` تاريخ تسجيل
// الدفعة لا تاريخ الشراء. أرشيف مشتريات نهائي ميزة مستقلة.
//
// النطاق (§5): المؤسسة والفروع المسموح بها يأتيان من الخادم عبر getTenantContext،
// ولا يُقرآن من جسم الطلب أبداً.
import { resolvePurchaseIdentity } from "./purchase-drug-identity";
import { prisma } from "@/app/lib/prisma";
import type { RawPriceRecord } from "@/app/lib/supplier-price-comparison";

/** سجل سعر مع الدواء الذي يتبعه — الحقل الإضافي يُستخدم للتجميع فقط ثم يُسقَط. */
interface ScopedPriceRecord extends RawPriceRecord {
    drugId: string;
}

export interface PriceHistoryScope {
    organizationId: string;
    /** الفروع التي يحق للمستخدم رؤية تاريخها — تُحسب في الخادم. */
    branchIds: string[];
}

/** حد أقصى للأدوية في الطلب الواحد — يحرس حجم الاستعلام (§267). */
export const MAX_DRUG_IDS = 50;

/**
 * الفروع التي يحق للمستخدم رؤية تاريخ أسعارها (§147).
 *
 * مستخدم مقيَّد بفرع يرى فرعه فقط ولا يتجاوزه بطلب مصطنع، لأن القائمة تُبنى من
 * `tenantCtx.user.branchId` لا من جسم الطلب. ومستخدم على مستوى المؤسسة يرى فروعها
 * كلها. بلا مؤسسة (SUPER_ADMIN) لا نطاق — لا تاريخ أسعار له أصلاً.
 */
export async function resolveHistoryScope(tenantCtx: {
    organizationId?: string;
    user: { branchId?: string };
}): Promise<PriceHistoryScope | null> {
    const organizationId = tenantCtx.organizationId;
    if (!organizationId) return null;

    if (tenantCtx.user.branchId) {
        // يُتحقق أن الفرع المفروض يتبع فعلاً مؤسسة السياق قبل الاعتماد عليه.
        const own = await prisma.branch.findFirst({
            where: { id: tenantCtx.user.branchId, organizationId },
            select: { id: true },
        });
        return own ? { organizationId, branchIds: [own.id] } : null;
    }

    const branches = await prisma.branch.findMany({
        where: { organizationId },
        select: { id: true },
    });
    return { organizationId, branchIds: branches.map((b) => b.id) };
}

/** حد أقصى لصفحة السجل التفصيلي (§91). */
export const HISTORY_PAGE_SIZE = 20;

function normalizeDrugIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<string>();
    for (const raw of ids) {
        if (typeof raw !== "string") continue;
        const v = raw.trim();
        if (v) seen.add(v);
        if (seen.size >= MAX_DRUG_IDS) break;
    }
    return Array.from(seen);
}

/**
 * سجلات أسعار الدفعات لكل دواء مطلوب، ضمن نطاق المؤسسة والفروع.
 *
 * استعلام مجمَّع واحد لكل المصدر، لا استعلام لكل صنف (§225). التجميع والاختيار
 * يتمّان في `buildSupplierOptions` النقية — هذه الطبقة تجلب وتُطبِّع فقط.
 */
async function loadBatchRecords(
    scope: PriceHistoryScope,
    drugIds: string[]
): Promise<ScopedPriceRecord[]> {
    if (drugIds.length === 0 || scope.branchIds.length === 0) return [];

    const rows = await prisma.batch.findMany({
        where: {
            inventory: { drugId: { in: drugIds }, branchId: { in: scope.branchIds } },
        },
        select: {
            id: true,
            costPrice: true,
            createdAt: true,
            supplierId: true,
            inventory: { select: { drugId: true, branchId: true } },
            supplier: {
                select: {
                    id: true,
                    name: true,
                    organizationId: true,
                    warehouseId: true,
                    warehouse: { select: { id: true, name: true, isActive: true } },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return rows.map((b) => {
        // مورد لا يتبع مؤسسة السياق لا يُنسب إليها (§130) — يُعامل كغير منسوب
        // بدل أن يُعرض اسمه لمؤسسة أخرى.
        const supplier = b.supplier && b.supplier.organizationId === scope.organizationId ? b.supplier : null;
        return {
            supplierId: supplier?.id ?? null,
            supplierName: supplier?.name ?? null,
            warehouseId: supplier?.warehouse?.id ?? null,
            warehouseName: supplier?.warehouse?.name ?? null,
            warehouseIsActive: supplier?.warehouse?.isActive ?? false,
            price: b.costPrice,
            recordedAt: b.createdAt.toISOString(),
            source: "BATCH" as const,
            sourceBranchId: b.inventory.branchId,
            recordId: b.id,
            drugId: b.inventory.drugId,
        };
    });
}

/**
 * المصدر البديل: بنود فواتير COMPLETED فقط (§119/§362).
 *
 * يُستدعى بأزواج (دواء، مورد) غير المغطاة بدفعات — وتُرشَّح النتيجة هنا مرة أخرى
 * على الأزواج المطلوبة كي لا يتسرّب زوج له دفعة أصلاً فيبدو المصدران سلسلة واحدة.
 */
async function loadCompletedPurchaseRecords(
    scope: PriceHistoryScope,
    drugIds: string[],
    coveredPairs: Set<string>
): Promise<ScopedPriceRecord[]> {
    if (drugIds.length === 0 || scope.branchIds.length === 0) return [];

    const rows = await prisma.purchaseItem.findMany({
        where: {
            drugId: { in: drugIds },
            purchase: { status: "COMPLETED", branchId: { in: scope.branchIds } },
        },
        select: {
            id: true,
            cost: true,
            drugId: true,
            purchase: {
                select: {
                    createdAt: true,
                    branchId: true,
                    supplier: {
                        select: {
                            id: true,
                            name: true,
                            organizationId: true,
                            warehouseId: true,
                            warehouse: { select: { id: true, name: true, isActive: true } },
                        },
                    },
                },
            },
        },
        orderBy: { purchase: { createdAt: "desc" } },
    });

    const out: ScopedPriceRecord[] = [];
    for (const it of rows) {
        const supplier = it.purchase.supplier;
        if (!supplier || supplier.organizationId !== scope.organizationId) continue;
        if (coveredPairs.has(`${it.drugId}::${supplier.id}`)) continue;
        out.push({
            supplierId: supplier.id,
            supplierName: supplier.name,
            warehouseId: supplier.warehouse?.id ?? null,
            warehouseName: supplier.warehouse?.name ?? null,
            warehouseIsActive: supplier.warehouse?.isActive ?? false,
            price: it.cost,
            recordedAt: it.purchase.createdAt.toISOString(),
            source: "COMPLETED_PURCHASE" as const,
            sourceBranchId: it.purchase.branchId,
            recordId: it.id,
            drugId: it.drugId,
        });
    }
    return out;
}

/** Only aliases owned by this institution or global rows with identical medicine identity. */
export async function loadDrugAliases(scope: PriceHistoryScope, ids: string[]): Promise<Map<string, string[]>> {
    const visible = { warehouseId: null, OR: [{ organizationId: scope.organizationId }, { organizationId: null }] };
    const select = { id: true, barcode: true, tradeName: true, scientificName: true, organizationId: true } as const;
    const requested = await prisma.globalDrug.findMany({ where: { ...visible, id: { in: ids } }, select });
    const barcodes = Array.from(new Set(requested.map(d => d.barcode.trim()).filter(Boolean)));
    const candidates = barcodes.length ? await prisma.globalDrug.findMany({ where: { ...visible, barcode: { in: barcodes } }, select }) : [];
    return new Map(requested.map(d => [d.id, resolvePurchaseIdentity(d, candidates).ids]));
}

export type DrugPriceRecords = Map<string, RawPriceRecord[]>;

/**
 * كل سجلات الأسعار المؤهلة للأدوية المطلوبة، مجمَّعة بمعرّف الدواء.
 * استعلامان مجمَّعان على الأكثر — واحد للدفعات وواحد للبديل.
 */
export async function loadPriceRecords(
    scope: PriceHistoryScope,
    rawDrugIds: unknown
): Promise<DrugPriceRecords> {
    const drugIds = normalizeDrugIds(rawDrugIds);
    const grouped: DrugPriceRecords = new Map(drugIds.map((id) => [id, []]));
    if (drugIds.length === 0) return grouped;

    const aliases = await loadDrugAliases(scope, drugIds);
    const allIds = Array.from(new Set(Array.from(aliases.values()).flat()));
    const batchRecords = await loadBatchRecords(scope, allIds);
    const purchaseRecords = await loadCompletedPurchaseRecords(scope, allIds, new Set());
    for (const [requestedId, aliasIds] of Array.from(aliases.entries())) {
        const batches = batchRecords.filter(r => aliasIds.includes(r.drugId));
        // A zero-only batch history must not suppress a completed paid invoice fallback.
        const covered = new Set(batches.filter(r => r.supplierId && r.price !== 0).map(r => r.supplierId));
        const purchases = purchaseRecords.filter(r => aliasIds.includes(r.drugId) && !covered.has(r.supplierId));
        const purchaseSuppliers = new Set(purchases.map(r => r.supplierId));
        const selected = [...batches.filter(r => !purchaseSuppliers.has(r.supplierId)), ...purchases];
        grouped.set(requestedId, selected.map(({ drugId: _drugId, ...record }) => record));
    }
    return grouped;
}

/**
 * السجل التفصيلي لزوج (دواء، مورد) واحد — مرقّم الصفحات ويُجلب عند الطلب فقط،
 * فلا تُحمَّل كل دفعات كل دواء عند فتح الصفحة (§91).
 *
 * يفصل سجلات الدفعات عن سجلات الفواتير عمداً (§120) بدل خلطهما في قائمة واحدة.
 */
export async function loadPairHistory(
    scope: PriceHistoryScope,
    drugId: string,
    supplierId: string,
    page = 1
): Promise<{
    batches: Array<{ id: string; price: number; recordedAt: string; branchId: string }>;
    purchases: Array<{ id: string; price: number; recordedAt: string; branchId: string }>;
    hasMore: boolean;
}> {
    const take = HISTORY_PAGE_SIZE;
    const skip = Math.max(0, (Math.max(1, page) - 1) * take);
    if (!drugId || !supplierId || scope.branchIds.length === 0) {
        return { batches: [], purchases: [], hasMore: false };
    }

    const aliases = await loadDrugAliases(scope, [drugId]);
    const ids = aliases.get(drugId) ?? [];
    if (!ids.length) return { batches: [], purchases: [], hasMore: false };
    const [batches, purchases] = await Promise.all([
        prisma.batch.findMany({
            where: {
                supplierId,
                supplier: { organizationId: scope.organizationId },
                inventory: { drugId: { in: ids }, branchId: { in: scope.branchIds } },
            },
            select: { id: true, costPrice: true, createdAt: true, inventory: { select: { branchId: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip,
            take: take + 1,
        }),
        prisma.purchaseItem.findMany({
            where: {
                drugId: { in: ids },
                purchase: {
                    status: "COMPLETED",
                    supplierId,
                    branchId: { in: scope.branchIds },
                    supplier: { organizationId: scope.organizationId },
                },
            },
            select: { id: true, cost: true, purchase: { select: { createdAt: true, branchId: true } } },
            orderBy: [{ purchase: { createdAt: "desc" } }, { id: "asc" }],
            skip,
            take: take + 1,
        }),
    ]);

    const hasMore = batches.length > take || purchases.length > take;
    return {
        batches: batches.slice(0, take).map((b) => ({
            id: b.id,
            price: b.costPrice,
            recordedAt: b.createdAt.toISOString(),
            branchId: b.inventory.branchId,
        })),
        purchases: purchases.slice(0, take).map((p) => ({
            id: p.id,
            price: p.cost,
            recordedAt: p.purchase.createdAt.toISOString(),
            branchId: p.purchase.branchId,
        })),
        hasMore,
    };
}
