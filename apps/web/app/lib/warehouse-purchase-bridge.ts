// المرحلة 5 من ميزة المذاخر: منطق جسر الاعتماد → فاتورة شراء — نقي وقابل للاختبار.
// يفصل قرار المورد المرآة (موجود؟ يُنشأ؟ اسم مشترك باسم المذخر) عن كتابة قاعدة البيانات.

export interface MirrorSupplierDecisionInput {
  /** مورد مرآة موجود لهذا (organizationId, warehouseId) — أو null */
  existingSupplier: { id: string } | null;
  /** هل المنظمة معروفة؟ (SUPER_ADMIN بلا organizationId لا يُنشأ له مورد مرآة) */
  organizationId: string | null;
}

export interface MirrorSupplierDecision {
  action: "USE" | "CREATE" | "BLOCKED_NO_ORG";
  supplierId?: string;
  /** الاسم المعتمد للمورد المرآة عند الإنشاء */
  name?: string;
}

/**
 * قرار المورد المرآة: مورد واحد لكل (منظمة، مذخر) — القيد الفريد في المخطط
 * يمنع التكرار حتى لو دخل اعتمادان متتاليان بنفس اللحظة (مع retry في المسار).
 * معيار القبول 5: تكرار الاعتماد لطلب ثانٍ من نفس المذخر لا ينشئ موردًا مكررًا.
 */
export function decideMirrorSupplier(input: MirrorSupplierDecisionInput): MirrorSupplierDecision {
  if (input.existingSupplier) {
    return { action: "USE", supplierId: input.existingSupplier.id };
  }
  if (!input.organizationId) {
    return { action: "BLOCKED_NO_ORG" };
  }
  return { action: "CREATE" };
}

export interface DraftPurchaseItem {
  drugId: string;
  /** الكمية النهائية بعد عرض المذخر (PARTIAL → الكمية المتاحة، AVAILABLE → المطلوبة كاملة، OUT_OF_STOCK → مستثنى) */
  quantity: number;
  /**
   * السعر المعتمد — يُشتق حصراً من effectiveLine() في warehouse-quote.ts (quotedPrice
   * إن وُجد وإلا unitPrice). requestedPrice مُستبعد عمداً: كان جزءاً مما يُعيد إحياء
   * سعر الأصناف النافدة قبل الإصلاح. لا تُعِد هذه السلسلة هنا — استوردها من هناك.
   */
  effectivePrice: number;
  /**
   * ميزة البونص: وحدات مجانية مُعتمَدة على هذا السطر (WarehouseOrderItem.bonusQuantity)
   * — تصل الصيدلية فعلياً وتُسجَّل كسطر PurchaseItem منفصل بكلفة صفر بالضبط
   * (انظر بناء planItems أدناه). لا تدخل quantity/effectivePrice أعلاه ولا
   * تُضاف لـ total: الصيدلية لا تدفع ثمنها إطلاقاً.
   */
  bonusQuantity?: number;
}

export interface DraftPurchasePlan {
  ok: boolean;
  errors: string[];
  total: number;
  items: Array<{ drugId: string; quantity: number; cost: number }>;
}

/**
 * يحسب بنود فاتورة الشراء المسودة من قائمة أصناف مُشتقة مسبقاً عبر effectiveLine()
 * (warehouse-quote.ts). هذه الدالة لا تعرف شيئاً عن status/OUT_OF_STOCK/PARTIAL —
 * على المستدعي أن يستبعد الأسطر ذات quantity=0 (بينها OUT_OF_STOCK دائماً) قبل
 * النداء، حتى لا يُسجَّل لها خطأ "كمية غير صالحة" هنا بالخطأ.
 * الإجمالي = Σ الكمية × السعر الفعلي.
 */
export function buildDraftPurchasePlan(
  items: DraftPurchaseItem[]
): DraftPurchasePlan {
  const errors: string[] = [];
  const planItems: Array<{ drugId: string; quantity: number; cost: number }> = [];
  let total = 0;

  for (const it of items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      errors.push(`كمية غير صالحة للصنف ${it.drugId}.`);
      continue;
    }
    if (!Number.isFinite(it.effectivePrice) || it.effectivePrice <= 0) {
      errors.push(`سعر غير صالح للصنف ${it.drugId}.`);
      continue;
    }
    planItems.push({ drugId: it.drugId, quantity: it.quantity, cost: it.effectivePrice });
    total += it.quantity * it.effectivePrice;

    // ميزة البونص: سطر منفصل بنفس drugId، كمية = bonusQuantity، كلفة = 0
    // بالضبط — لا دمج بمتوسط كلفة الوحدات المدفوعة، وبلا إضافة لـ total (بونص
    // بلا مقابل مالي بتعريفه). عمداً يتخطّى فحص "سعر غير صالح" أعلاه: ذلك
    // الفحص يحرس سعراً صفرياً/سالباً بالغلط على سطر مدفوع، بينما هذا السطر
    // صفري الكلفة عمداً (تمييز هيكلي بسطر منفصل، لا تحايل على نفس الفحص).
    // الأثر لاحقاً في app/api/purchases/[id]/receive/route.ts: كل PurchaseItem
    // يُنشئ Batch مستقلاً بـ costPrice الخاص به، فدفعة البونص تُسجَّل بكلفة
    // صفر حقيقية على الرفّ ودفعة المدفوع بكلفتها الكاملة.
    const bonusQuantity = it.bonusQuantity;
    if (typeof bonusQuantity === "number" && Number.isInteger(bonusQuantity) && bonusQuantity > 0) {
      planItems.push({ drugId: it.drugId, quantity: bonusQuantity, cost: 0 });
    }
  }

  if (planItems.length === 0) {
    errors.push("لا توجد أصناف صالحة لبناء فاتورة الشراء — كل بنود الطلب نافدة.");
  }

  return { ok: errors.length === 0, errors, total, items: planItems };
}
