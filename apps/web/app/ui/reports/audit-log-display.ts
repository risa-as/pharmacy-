export type AuditEntry = {
  id: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  branchId: string | null;
  createdAt: string;
};
export const AUDIT_ACTIONS: Record<
  string,
  {
    label: string;
    tone: "success" | "primary" | "destructive" | "warning" | "info" | "muted";
  }
> = {
  CREATE: { label: "إنشاء", tone: "success" },
  UPDATE: { label: "تعديل", tone: "primary" },
  DELETE: { label: "حذف", tone: "destructive" },
  RETURN: { label: "مرتجع", tone: "warning" },
  LOGIN: { label: "تسجيل دخول", tone: "info" },
  LOGOUT: { label: "تسجيل خروج", tone: "muted" },
  PRICE_CHANGE: { label: "تغيير سعر", tone: "warning" },
  TRANSFER: { label: "تحويل", tone: "info" },
  DEBT_PAYMENT: { label: "تحصيل دين", tone: "success" },
  ADD_BATCH: { label: "إضافة مخزون", tone: "success" },
  SHIFT_OPEN: { label: "فتح وردية", tone: "info" },
  SHIFT_CLOSE: { label: "إغلاق وردية", tone: "muted" },
  WRITE_OFF: { label: "شطب مخزون", tone: "destructive" },
  EXPORT: { label: "تصدير", tone: "info" },
  GLOBALIZE: { label: "تعميم دواء", tone: "primary" },
  SETTLE_OWNERSHIP: { label: "تسوية الملكية", tone: "warning" },
  MERGE_RECEIPT_INVENTORY: { label: "دمج مخزون الاستلام", tone: "warning" },
  DEVICE_KEY_APPROVE: { label: "اعتماد جهاز", tone: "success" },
  DEVICE_KEY_REVOKE: { label: "إلغاء اعتماد جهاز", tone: "destructive" },
  CLIENT_EVENT: { label: "بلاغ من التطبيق", tone: "muted" },
};
export const AUDIT_ENTITIES: Record<string, string> = {
  SALE: "مبيعات",
  INVENTORY: "مخزون",
  DRUG: "دواء",
  GLOBAL_DRUG: "قاعدة الأدوية",
  USER: "مستخدم",
  EXPENSE: "مصروفات",
  TRANSFER: "تحويل",
  PATIENT: "مريض",
  SUPPLIER: "مورد",
  SUPPLIER_PAYMENT: "دفعة مورد",
  SHIFT: "وردية",
  PURCHASE: "مشتريات",
  SETTING: "إعدادات",
  SETTINGS: "إعدادات",
  DEBT: "دين",
  BATCH: "دفعة مخزون",
  BACKUP: "نسخة احتياطية",
  DEVICE_LICENSE: "ترخيص جهاز",
  STOCKTAKE: "جرد",
  MOBILE_OPERATION: "عملية جوال",
  CLIENT_EVENT: "بلاغ تطبيق",
  WAREHOUSE_OPERATING_MODE: "وضع المذخر",
  WAREHOUSE_CATALOG: "كتالوج المذخر",
  DISCOUNT: "خصم",
  INSURANCE_COMPANY: "شركة تأمين",
  WHATSAPP: "واتساب",
};
const labels: Record<string, string> = {
  total: "الإجمالي",
  amount: "المبلغ",
  quantity: "الكمية",
  discount: "الخصم",
  itemCount: "عدد الأصناف",
  drug: "الدواء",
  drugName: "الدواء",
  barcode: "الباركود",
  batchNumber: "رقم الدفعة",
  lossValue: "قيمة الشطب",
  expectedCash: "النقد المتوقع",
  actualCash: "النقد الفعلي",
  status: "الحالة",
  method: "طريقة الدفع",
  changes: "التغييرات",
  old: "قبل التعديل",
  new: "بعد التعديل",
  before: "قبل التعديل",
  after: "بعد التعديل",
  from: "من",
  to: "إلى",
  name: "الاسم",
  email: "البريد الإلكتروني",
  role: "الدور",
  note: "الملاحظة",
  notes: "الملاحظات",
  description: "الوصف",
  reason: "السبب",
  price: "السعر",
  cost: "التكلفة",
  balance: "الرصيد",
  permissions: "الصلاحيات",
  reportedAction: "الإجراء المبلّغ",
  reportedEntity: "القسم المبلّغ",
  reportedDetails: "تفاصيل البلاغ",
};
const sensitive =
  /password|token|secret|licenseKey|signature|authorization|hash/i;
function valueText(value: unknown, depth = 0): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "string") return value;
  if (depth > 2) return "تفاصيل إضافية";
  if (Array.isArray(value))
    return value
      .slice(0, 15)
      .map((v) => valueText(v, depth + 1))
      .join("، ");
  return (
    Object.entries(value as object)
      .filter(([k]) => !sensitive.test(k) && !!labels[k])
      .slice(0, 20)
      .map(([k, v]) => `${labels[k]}: ${valueText(v, depth + 1)}`)
      .join(" · ") || "تفاصيل محفوظة"
  );
}
export function auditDetails(
  raw: string | null,
): { label: string; value: string }[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ label: "التفاصيل", value: raw }];
  }
  if (!parsed || typeof parsed !== "object")
    return [{ label: "التفاصيل", value: String(parsed ?? "—") }];
  return Object.entries(parsed)
    .filter(([k, v]) => v != null && !sensitive.test(k) && !!labels[k])
    .map(([k, v]) => ({ label: labels[k], value: valueText(v) }));
}
export function auditSource(raw: string | null) {
  try {
    const source = JSON.parse(raw || "{}")?.source;
    if (source === "desktop-sync")
      return { label: "سطح المكتب", kind: "desktop" as const };
    if (source === "client-report")
      return { label: "بلاغ غير مثبت", kind: "client" as const };
    if (source === "mobile")
      return { label: "الجوال", kind: "mobile" as const };
  } catch {}
  return { label: "غير محدد", kind: "unknown" as const };
}
