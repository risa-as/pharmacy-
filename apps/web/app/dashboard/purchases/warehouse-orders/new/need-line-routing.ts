// توجيه سطر الاحتياج: إلى طلب إلكتروني لمذخر، أو إلى قائمة الطلب اليدوي لمورد.
//
// مستخرج من NeedListClient.tsx كي يُختبَر (إعداد vitest لا يُحمِّل ‎.tsx). أخطر
// قاعدة هنا: **معرّف مورد محلي لا يصل أبداً إلى warehouseId**؛ لو حدث لأُرسل
// طلب إلكتروني حقيقي إلى مذخر غير موجود. لذلك قيمة القائمة المنسدلة موسومة
// (wh:/sup:) وتُفحص مقابل القائمتين المعروفتين قبل أي تغيير على السطر.
import {
    selectedOption,
    type ActiveWarehouse,
    type NeedLine,
    type OrgSupplier,
} from './types';

export type OrderTarget = { kind: 'warehouse'; id: string } | { kind: 'supplier'; id: string };

export function encodeOrderTarget(target: OrderTarget): string {
    return `${target.kind === 'warehouse' ? 'wh' : 'sup'}:${target.id}`;
}

/** '' أو قيمة غير معروفة البادئة ⇒ null (= إلغاء الاختيار). */
export function parseOrderTarget(value: string): OrderTarget | null {
    const sep = value.indexOf(':');
    if (sep <= 0) return null;
    const prefix = value.slice(0, sep);
    const id = value.slice(sep + 1);
    if (!id) return null;
    if (prefix === 'wh') return { kind: 'warehouse', id };
    if (prefix === 'sup') return { kind: 'supplier', id };
    return null;
}

/** القيمة الحالية للقائمة المنسدلة لسطر. */
export function currentTargetValue(line: NeedLine): string {
    if (line.manualWarehouseId) return encodeOrderTarget({ kind: 'warehouse', id: line.manualWarehouseId });
    if (line.manualSupplierId) return encodeOrderTarget({ kind: 'supplier', id: line.manualSupplierId });
    return '';
}

/**
 * يطبّق اختيار القائمة المنسدلة على السطر. الاختياران متنافيان: اختيار أحدهما
 * يمسح الآخر ويمسح أي مورد مختار من المقارنة.
 *
 * - مذخر: يُقبل فقط إن كان في دليل المذاخر النشطة ولسطر له مقابل عالمي.
 * - مورد: يُقبل فقط إن كان من موردي المؤسسة **وغير مربوط بمذخر** — المربوط
 *   تُطلب أصنافه إلكترونياً عبر مذخره، لا يدوياً.
 * - قيمة غير صالحة: تمسح الاختيار اليدوي ولا تخمّن.
 */
export function applyOrderTarget(
    line: NeedLine,
    value: string,
    warehouses: ActiveWarehouse[],
    suppliers: OrgSupplier[]
): NeedLine {
    const cleared: NeedLine = {
        ...line,
        manualWarehouseId: null,
        manualWarehouseName: null,
        manualSupplierId: null,
        manualSupplierName: null,
        selectedSupplierId: null,
        manuallyChosen: false,
        chosenPriceAtSelection: null,
    };
    const target = parseOrderTarget(value);
    if (!target) return cleared;

    if (target.kind === 'warehouse') {
        const wh = warehouses.find((w) => w.id === target.id);
        if (!wh || !line.globalDrugId) return cleared;
        return { ...cleared, manualWarehouseId: wh.id, manualWarehouseName: wh.name };
    }

    const sup = suppliers.find((s) => s.id === target.id);
    if (!sup || sup.warehouseId) return cleared;
    return { ...cleared, manualSupplierId: sup.id, manualSupplierName: sup.name };
}

export interface SendableLine {
    line: NeedLine;
    warehouseId: string;
    warehouseName: string;
    supplierName: string;
    price: number | null;
}

export interface BlockedLine {
    line: NeedLine;
    reason: string;
    /** الجهة التي يُطلب منها يدوياً — عنوان المجموعة في القائمة المطبوعة. null = بلا جهة. */
    manualSupplierName: string | null;
}

/** يصنّف الأسطر: قابل للإرسال الإلكتروني، أو للطلب اليدوي. */
export function classifyNeedLines(lines: NeedLine[]): { sendable: SendableLine[]; blocked: BlockedLine[] } {
    const sendable: SendableLine[] = [];
    const blocked: BlockedLine[] = [];

    for (const line of lines) {
        // الطلب اليدوي من مورد محلي يسبق كل شيء — ولا يحتاج مقابلاً عالمياً.
        if (line.manualSupplierId) {
            const name = line.manualSupplierName ?? 'مورد';
            blocked.push({ line, reason: `طلب يدوي من المورد «${name}».`, manualSupplierName: name });
            continue;
        }
        const opt = selectedOption(line);
        if (!line.globalDrugId) {
            blocked.push({
                line,
                reason: line.orderabilityReason ?? 'لا مقابل عالمي لهذا الصنف.',
                manualSupplierName: opt && !opt.orderable ? opt.supplierName : null,
            });
            continue;
        }
        if (opt && opt.orderable && opt.warehouseId) {
            sendable.push({
                line,
                warehouseId: opt.warehouseId,
                warehouseName: opt.warehouseName ?? 'مذخر',
                supplierName: opt.supplierName,
                price: opt.comparable ? opt.price : null,
            });
            continue;
        }
        // §81: مذخر اختاره المستخدم يدوياً لصنف بلا تاريخ — طلب تسعير بلا سعر متوقع.
        if (line.manualWarehouseId) {
            sendable.push({
                line,
                warehouseId: line.manualWarehouseId,
                warehouseName: line.manualWarehouseName ?? 'مذخر',
                supplierName: 'طلب تسعير — بلا تاريخ سعر',
                price: null,
            });
            continue;
        }
        if (opt) {
            blocked.push({
                line,
                reason: opt.orderabilityReason ?? 'المورد المختار غير قابل للإرسال.',
                manualSupplierName: opt.supplierName,
            });
        } else {
            blocked.push({
                line,
                reason: line.comparison?.hasPrice === false
                    ? 'لا يوجد سعر شراء مسجل، ولم تختر مذخراً أو مورداً لطلبه منه.'
                    : 'لم يُختر مورد لهذا الصنف.',
                manualSupplierName: null,
            });
        }
    }
    return { sendable, blocked };
}

export const UNASSIGNED_SUPPLIER_LABEL = 'بلا مورد محدد';

/** يجمّع قائمة الطلب اليدوي حسب المورد بترتيب أول ظهور، و«بلا مورد» في النهاية. */
export function groupBlockedBySupplier(blocked: BlockedLine[]): Array<{ supplierName: string; items: BlockedLine[] }> {
    const order: string[] = [];
    const map = new Map<string, BlockedLine[]>();
    for (const b of blocked) {
        const key = b.manualSupplierName ?? UNASSIGNED_SUPPLIER_LABEL;
        if (!map.has(key)) {
            map.set(key, []);
            order.push(key);
        }
        map.get(key)!.push(b);
    }
    const named = order.filter((k) => k !== UNASSIGNED_SUPPLIER_LABEL);
    const tail = map.has(UNASSIGNED_SUPPLIER_LABEL) ? [UNASSIGNED_SUPPLIER_LABEL] : [];
    return [...named, ...tail].map((k) => ({ supplierName: k, items: map.get(k)! }));
}

/** يقسم دليل المذاخر: ما تتعامل معه المؤسسة أولاً ثم بقية مذاخر المنصة؛ الاسم داخل كل قسم. */
export function splitWarehousesByRelation(warehouses: ActiveWarehouse[]): {
    related: ActiveWarehouse[];
    others: ActiveWarehouse[];
} {
    const byName = (a: ActiveWarehouse, b: ActiveWarehouse) => a.name.localeCompare(b.name, 'ar');
    const related = warehouses.filter((w) => w.isRelated || !!w.linkedSupplier).sort(byName);
    const others = warehouses.filter((w) => !(w.isRelated || !!w.linkedSupplier)).sort(byName);
    return { related, others };
}

/**
 * مجموعات إرسال لمذاخر بلا مورد مربوط ولها موردون محليون مشابهون — تحتاج تأكيداً
 * صريحاً قبل الإرسال كي لا يُنشأ مورد مكرر عند الاعتماد.
 */
export function warehousesNeedingDuplicateConfirm(
    warehouseIds: string[],
    warehouses: ActiveWarehouse[]
): string[] {
    return Array.from(new Set(warehouseIds)).filter((id) => {
        const wh = warehouses.find((w) => w.id === id);
        return !!wh && !wh.linkedSupplier && (wh.possibleDuplicates?.length ?? 0) > 0;
    });
}
