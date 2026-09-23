/** API projection: calculations remain on the shared server engine. */
export interface PlanningSettings {
  from: string;
  to: string;
  coverageDays: number;
  leadDays: number;
  safetyDays: number;
  fromArrival: boolean;
}
export interface PlanningItem {
  inventoryId: string;
  drugId: string;
  branchId: string;
  branchName: string;
  drugName: string;
  scientificName: string;
  barcode: string;
  currentStock: number;
  suggestedQty: number;
  coverage: number | null;
  sold: number;
  returned: number;
  netSales: number;
  observedDays: number;
  averageDailySales: number;
  minStock: number;
  cost: number | null;
  unitsPerPack: number | null;
  pending: number;
  urgentUnits: number;
  expiredUnits: number;
  noDemand: boolean;
  low: boolean;
  out: boolean;
  insufficient: boolean;
  action: boolean;
  qualityReasons: string[];
  incoming: {
    quantity: number;
    date: string | null;
    confirmed: boolean;
    reference: string;
  }[];
}
export interface PlanningResult {
  rows: PlanningItem[];
  from: string;
  to: string;
  days: number;
  today: string;
  generatedAt: string;
  notice: string;
}
export const numberText = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const DAY = 86400000;
export function recentPeriod(days: number, now = new Date()) {
  const today = new Date(now.getTime() + 3 * 3600000)
    .toISOString()
    .slice(0, 10);
  const end = Date.parse(today + "T00:00:00Z");
  return {
    from: new Date(end - days * DAY).toISOString().slice(0, 10),
    to: new Date(end - DAY).toISOString().slice(0, 10),
  };
}
export function validateSettings(s: PlanningSettings) {
  const validDate = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!validDate(s.from) || !validDate(s.to))
    return "أدخل التاريخ بصيغة YYYY-MM-DD";
  const days = (Date.parse(s.to) - Date.parse(s.from)) / DAY + 1;
  if (days < 1 || days > 366 || s.to > recentPeriod(1).to)
    return "اختر من 1 إلى 366 يوماً مكتملة تنتهي قبل اليوم";
  if (
    ![s.coverageDays, s.leadDays, s.safetyDays].every(Number.isSafeInteger) ||
    s.coverageDays < 1 ||
    s.coverageDays > 365 ||
    s.leadDays < 0 ||
    s.leadDays > 180 ||
    s.safetyDays < 0 ||
    s.safetyDays > 90
  )
    return "التغطية من 1 إلى 365، الوصول من 0 إلى 180، والأمان من 0 إلى 90 يوماً";
  return null;
}
export type PlanningFilter =
  | "action"
  | "out"
  | "urgent"
  | "insufficient"
  | "low"
  | "pending"
  | "review"
  | "all";
export const planningFilters: { key: PlanningFilter; label: string }[] = [
  { key: "action", label: "يحتاج إجراء" },
  { key: "out", label: "نافد" },
  { key: "urgent", label: "قبل الوصول" },
  { key: "insufficient", label: "لا يغطي المدة" },
  { key: "low", label: "أقل من الحد" },
  { key: "pending", label: "قيد الطلب" },
  { key: "review", label: "يحتاج مراجعة" },
  { key: "all", label: "الكل" },
];
export function matchesPlanningFilter(r: PlanningItem, f: PlanningFilter) {
  switch (f) {
    case "action":
      return r.action;
    case "out":
      return r.out;
    case "urgent":
      return r.urgentUnits > 0;
    case "insufficient":
      return r.insufficient;
    case "low":
      return r.low;
    case "pending":
      return r.incoming.length > 0;
    case "review":
      return r.noDemand || r.qualityReasons.length > 0;
    default:
      return true;
  }
}
