// اقتراح رقم الدفعة/تاريخ الانتهاء عند استلام فاتورة صادرة من طلب مذخر على
// المنصة: المذخر يعرف الدفعة الحقيقية التي شحنها (WarehouseStockMove)، فلا
// داعي أن يعيد الصيدلاني كتابتها من فاتورة ورقية. منطق نقي بالكامل — بلا
// Prisma وبلا next/* — يستدعيه app/lib/actions/purchase-actions.ts بعد أن
// يجلب صفوف الشحن من قاعدة البيانات، ويُختبَر بمعزل هنا.
//
// القاعدة الحرجة: الشحن يُخصَّص FEFO (allocateFEFO في app/lib/warehouse-stock.ts)،
// فسطر طلب واحد قد يُسحب من دفعتين أو أكثر بتواريخ انتهاء مختلفة، بينما
// app/lib/purchase-receipt.ts يُنشئ دفعة واحدة فقط لكل سطر شراء. لذلك: نقترح
// قيمة تلقائية فقط حين تتّحد كل حركات الشحن لدواء معيّن على زوج (رقم الدفعة،
// تاريخ الانتهاء) وحيد؛ حين يتعدد الزوج نمتنع تماماً ونعرض كل ما شُحن فعلاً
// ليختار الصيدلاني بنفسه — اختيار أحد الزوجين عشوائياً كان سيكتب تاريخ انتهاء
// زائفاً في Batch.expiryDate، وهو بالضبط الخلل الذي عولج للتو في شاشة الاستلام.

export interface ShippedBatchRow {
    drugId: string;
    batchNumber: string;
    expiryDate: Date | string;
    quantity: number;
}

export interface ShippedBatchOption {
    batchNumber: string;
    expiryDate: Date;
    quantity: number;
}

export type ShippedBatchPrefill =
    | { kind: 'SINGLE'; batchNumber: string; expiryDate: Date }
    | { kind: 'MULTIPLE'; batches: ShippedBatchOption[] };

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

/**
 * يجمع صفوف حركات الشحن (كل صف = حركة SHIPMENT واحدة مربوطة بدفعة) حسب
 * الدواء، ثم يُطابق أزواج (رقم الدفعة، تاريخ الانتهاء) المميّزة لكل دواء:
 * - زوج واحد مميّز → SINGLE، صالح للتعبئة التلقائية.
 * - أكثر من زوج مميّز → MULTIPLE مع كل الخيارات (بالكمية مجمّعة لكل زوج)
 *   بلا اقتراح تلقائي.
 * دواء لا صفوف له إطلاقاً لا يظهر في الخريطة الناتجة إطلاقاً (لا مفتاح له) —
 * على المستدعي معاملة غياب المفتاح كـ "لا اقتراح".
 */
export function computeShippedBatchPrefill(rows: ShippedBatchRow[]): Map<string, ShippedBatchPrefill> {
    const byDrug = new Map<string, ShippedBatchRow[]>();
    for (const row of rows) {
        const list = byDrug.get(row.drugId);
        if (list) list.push(row);
        else byDrug.set(row.drugId, [row]);
    }

    const result = new Map<string, ShippedBatchPrefill>();
    for (const [drugId, drugRows] of Array.from(byDrug.entries())) {
        // مفتاح التمييز = رقم الدفعة + قيمة تاريخ الانتهاء الفعلية (لا مرجع الكائن)،
        // فدفعتان بنفس الرقم والتاريخ من حركتين منفصلتين تنهاران إلى زوج واحد.
        const byPair = new Map<string, ShippedBatchOption>();
        for (const row of drugRows) {
            const expiryDate = toDate(row.expiryDate);
            const key = `${row.batchNumber}||${expiryDate.toISOString()}`;
            const existing = byPair.get(key);
            if (existing) existing.quantity += row.quantity;
            else byPair.set(key, { batchNumber: row.batchNumber, expiryDate, quantity: row.quantity });
        }

        const pairs = Array.from(byPair.values());
        if (pairs.length === 1) {
            result.set(drugId, { kind: 'SINGLE', batchNumber: pairs[0].batchNumber, expiryDate: pairs[0].expiryDate });
        } else {
            result.set(drugId, { kind: 'MULTIPLE', batches: pairs });
        }
    }
    return result;
}
