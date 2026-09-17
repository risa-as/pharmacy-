// المرحلة 4 من خطة «طلب الأدوية حسب الاحتياج»: تقسيم قائمة الاحتياج إلى طلبات،
// وقواعد مفاتيح منع التكرار وإعادة المحاولة — نقي وقابل للاختبار بلا متصفح.
//
// استُخرج من مكوّن الواجهة عمداً: إعداد الاختبارات في هذا المستودع لا يُحمِّل ملفات
// `.tsx` إطلاقاً، فلو بقي المنطق هناك لبقي بلا اختبار — وهو أخطر جزء في الميزة
// (تكرار طلب حقيقي على مذخر حقيقي).
//
// القواعد الملزمة:
//  §189 التجميع بـ`warehouseId` الحقيقي لا باسم المورد ولا باسم المذخر.
//  §191 مفتاح مستقل لكل مجموعة يُنشأ **مرة** عند تثبيت الحمولة.
//  §192 نتيجة غير مؤكدة ⇒ إعادة **نفس** المفتاح؛ لا مفتاح جديد قد يكرّر طلباً نجح.
//  §193 مجموعة عُدِّلت وثبت أنها لم تُرسل ⇒ مفتاح جديد. المجهولة تحتفظ بمفتاحها.
//  §194 ترتيب البنود ثابت — `requestHash` في الخادم يتأثر بالترتيب.
//  §195 المجموعة الناجحة لا تدخل إعادة الإرسال.
//  §197 تجاوز الحد يُكتشف قبل أي إرسال.

export const MAX_ITEMS_PER_ORDER = 100;

export type GroupStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';

/** أقل ما يلزم لتقسيم سطر — مستقل عن شكل NeedLine في الواجهة. */
export interface GroupableLine {
    tradeName?: string;
    drugId: string;
    barcode: string;
    quantity: number;
    /** المذخر الذي سيستقبل هذا الصنف — null يعني غير قابل للإرسال. */
    warehouseId: string | null;
    warehouseName: string | null;
    /** اسم المورد المحلي — للعرض كعنوان فصل داخل المجموعة (§96). */
    supplierName: string | null;
    /** السعر المتوقع؛ null يعني «بلا سعر متوقع» ويُرسَل 0 لا كعرض مجاني (§383). */
    unitPrice: number | null;
}

export interface SendGroupPlan {
    hasUncertainOutcome?: boolean;
    /** Frozen BEFORE the first network request; retries must use this exact body. */
    payload?: OrderPayload;
    warehouseId: string;
    warehouseName: string;
    supplierNames: string[];
    lines: GroupableLine[];
    idempotencyKey: string;
    status: GroupStatus;
    orderNumber?: string | null;
    error?: string;
}

/** حالة إرسال محفوظة من جلسة سابقة. */
export interface PriorSendState {
    payload?: OrderPayload;
    warehouseId: string;
    idempotencyKey: string;
    status: GroupStatus;
    orderNumber?: string | null;
}

/**
 * يقسّم الأسطر القابلة للإرسال إلى مجموعة لكل مذخر.
 *
 * `newKey` يُحقن كي تبقى الدالة حتمية في الاختبار — لا `crypto.randomUUID` داخلها.
 * ترتيب الأسطر داخل المجموعة يتبع ترتيب الإدخال حرفياً (§194)، وترتيب المجموعات
 * يتبع أول ظهور لكل مذخر — كلاهما مستقر بين استدعاءين بنفس المدخلات.
 */
export function buildSendGroups(
    lines: GroupableLine[],
    newKey: () => string,
    prior: PriorSendState[] = []
): SendGroupPlan[] {
    const order: string[] = [];
    const byWarehouse = new Map<string, SendGroupPlan>();

    for (const line of lines) {
        if (!line.warehouseId) continue; // غير قابل للإرسال — لا يدخل أي مجموعة
        let g = byWarehouse.get(line.warehouseId);
        if (!g) {
            g = {
                warehouseId: line.warehouseId,
                warehouseName: line.warehouseName ?? 'مذخر',
                supplierNames: [],
                lines: [],
                idempotencyKey: newKey(),
                status: 'PENDING',
            };
            byWarehouse.set(line.warehouseId, g);
            order.push(line.warehouseId);
        }
        g.lines.push(line);
        if (line.supplierName && !g.supplierNames.includes(line.supplierName)) {
            g.supplierNames.push(line.supplierName);
        }
    }

    const groups = order.map((id) => byWarehouse.get(id)!);

    // استرداد الحالة السابقة: المفتاح يُعاد استعماله **فقط** للمجموعة التي أُرسلت
    // أو كانت نتيجتها مجهولة. المجموعة الفاشلة (رفض صريح من الخادم) لم تُنشئ طلباً،
    // فحمولتها الجديدة تستحق مفتاحاً جديداً (§193).
    for (const g of groups) {
        const p = prior.find((x) => x.warehouseId === g.warehouseId);
        if (p && (p.status === 'SENT' || p.status === 'UNKNOWN' || p.status === 'SENDING')) {
            const fresh = buildOrderPayload(g, p.payload?.branchId, p.payload?.notes ?? null);
            if (!p.payload || JSON.stringify(fresh.items) !== JSON.stringify(p.payload.items)) {
                throw new Error('يجب استرداد حمولة الطلب الأصلي قبل إنشاء مجموعة بديلة.');
            }
            g.idempotencyKey = p.idempotencyKey;
            g.payload = p.payload;
            g.status = p.status === 'SENDING' ? 'UNKNOWN' : p.status;
            g.orderNumber = p.orderNumber;
        }
    }

    return groups;
}

/** المجموعات التي ما زالت تحتاج إرسالاً — الناجحة مستثناة (§195). */
export function groupsToSend(groups: SendGroupPlan[]): SendGroupPlan[] {
    return groups.filter((g) => g.status !== 'SENT');
}

/** المجموعات التي تجاوزت الحد — يُكتشف قبل أي إرسال (§197). */
export function oversizedGroups(groups: SendGroupPlan[]): SendGroupPlan[] {
    return groups.filter((g) => g.lines.length > MAX_ITEMS_PER_ORDER);
}

/** هل يجوز الإرسال الآن؟ */
export function canSubmit(groups: SendGroupPlan[]): { ok: boolean; reason?: string } {
    if (groups.length === 0) return { ok: false, reason: 'لا توجد أصناف قابلة للإرسال.' };
    const over = oversizedGroups(groups);
    if (over.length > 0) {
        return {
            ok: false,
            reason: `${over.map((g) => g.warehouseName).join('، ')} — تجاوزت مجموعته حد ${MAX_ITEMS_PER_ORDER} صنف لكل طلب.`,
        };
    }
    if (groupsToSend(groups).length === 0) return { ok: false, reason: 'أُرسلت كل الطلبات.' };
    return { ok: true };
}

/**
 * حمولة الإرسال لمجموعة واحدة. البنود بترتيب المجموعة نفسه دائماً (§194).
 *
 * السعر غير المعروف يُرسَل 0 — وهو ما يفهمه الخادم كـ«بلا سعر مطلوب»
 * (`requestedPrice = unitPrice > 0 ? unitPrice : null`)، لا كعرض مجاني (§383).
 */
export interface OrderPayload {
    warehouseId: string;
    branchId?: string;
    idempotencyKey: string;
    items: Array<{ barcode: string; quantity: number; unitPrice: number }>;
    notes: string | null;
}

export function buildOrderPayload(
    group: SendGroupPlan,
    branchId: string | undefined,
    notes: string | null
): OrderPayload {
    if (group.payload) return group.payload;
    return {
        warehouseId: group.warehouseId,
        ...(branchId ? { branchId } : {}),
        idempotencyKey: group.idempotencyKey,
        items: group.lines.map((l) => ({
            barcode: l.barcode,
            quantity: l.quantity,
            unitPrice: l.unitPrice !== null && l.unitPrice > 0 ? l.unitPrice : 0,
        })),
        notes: notes && notes.trim() ? notes.trim() : null,
    };
}

/** Server/proxy errors and conflicts never prove that no order was committed. */
export function classifySendResponse(status: number, data: unknown, previouslyUnknown = false): 'SENT' | 'FAILED' | 'UNKNOWN' {
    const body = data as { order?: { id?: unknown; orderNumber?: unknown } } | null;
    if (status >= 200 && status < 300) {
        return typeof body?.order?.id === 'string' && !!body.order.id ? 'SENT' : 'UNKNOWN';
    }
    if (previouslyUnknown) return 'UNKNOWN';
    return [400, 401, 403, 404, 422, 429].includes(status) ? 'FAILED' : 'UNKNOWN';
}

export function restoreSendGroups(raw: unknown, branchId: string): SendGroupPlan[] {
    if (!Array.isArray(raw)) throw new Error('سجل إرسال غير صالح');
    const keys = new Set<string>();
    return raw.map((g: SendGroupPlan) => {
        if (!g || !Array.isArray(g.lines) || !g.warehouseId || typeof g.idempotencyKey !== 'string'
            || keys.has(g.idempotencyKey) || !['PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN'].includes(g.status)) {
            throw new Error('سجل إرسال غير صالح');
        }
        keys.add(g.idempotencyKey);
        if (g.status !== 'PENDING' && !g.payload) throw new Error('حمولة الطلب الأصلي غير محفوظة');
        if (g.payload) {
            const expected = buildOrderPayload({ ...g, payload: undefined }, branchId, g.payload.notes);
            if (JSON.stringify(expected) !== JSON.stringify(g.payload)) throw new Error('حمولة الطلب لا تطابق الفرع أو الأصناف');
        }
        return { ...g, hasUncertainOutcome: g.hasUncertainOutcome || g.status === 'SENDING' || g.status === 'UNKNOWN', status: g.status === 'SENDING' ? 'UNKNOWN' : g.status };
    });
}

/** The durable write is deliberately outside the transport catch: no write, no send. */
export async function executeSendAttempt<T extends SendGroupPlan>(
    group: T,
    branchId: string,
    notes: string | null,
    save: (group: T) => void,
    transport: (payload: OrderPayload) => Promise<{ status: number; data: any }>,
): Promise<T> {
    if (group.status === 'SENT') return group;
    const prepared: T = { ...group, payload: buildOrderPayload(group, branchId, notes), status: 'SENDING' };
    save(prepared);
    let result: T;
    try {
        const response = await transport(prepared.payload!);
        const status = classifySendResponse(response.status, response.data, prepared.hasUncertainOutcome);
        result = { ...prepared, status, hasUncertainOutcome: status === 'UNKNOWN',
            orderNumber: status === 'SENT' ? response.data.order.orderNumber ?? null : prepared.orderNumber,
            error: status === 'SENT' ? undefined : response.data?.details?.[0]?.message
                ?? response.data?.error ?? 'لم تصل نتيجة مؤكدة. أعد المحاولة بنفس الطلب.' };
    } catch {
        result = { ...prepared, status: 'UNKNOWN', hasUncertainOutcome: true,
            error: 'انقطع الاتصال. أعد المحاولة لاسترجاع نتيجة الطلب الأصلي دون تكراره.' };
    }
    save(result);
    return result;
}

/** كل المفاتيح متمايزة؟ حارس ضد إعادة استعمال مفتاح لمذخرين (§386). */
export function keysAreDistinct(groups: SendGroupPlan[]): boolean {
    const keys = groups.map((g) => g.idempotencyKey);
    return new Set(keys).size === keys.length;
}
