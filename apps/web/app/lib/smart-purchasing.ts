/** Shared, deterministic purchasing math. All quantities use the inventory unit. */
export const DAY = 86400000;
export function baghdadDate(date = new Date()) {
  return new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}
export function dateStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("تاريخ غير صالح");
  const d = new Date(value + "T00:00:00+03:00");
  if (!Number.isFinite(d.getTime()) || baghdadDate(d) !== value)
    throw new Error("تاريخ غير صالح");
  return d;
}
export function analysisPeriod(from?: string, to?: string, now = new Date()) {
  const today = dateStart(baghdadDate(now));
  const end = to ? new Date(dateStart(to).getTime() + DAY) : today;
  const start = from ? dateStart(from) : new Date(end.getTime() - 30 * DAY);
  const days = Math.round((end.getTime() - start.getTime()) / DAY);
  if (days < 1 || days > 366 || end > today)
    throw new Error("اختر من 1 إلى 366 يوماً مكتملة تنتهي قبل اليوم");
  return {
    start,
    end,
    days,
    from: baghdadDate(start),
    to: baghdadDate(new Date(end.getTime() - DAY)),
  };
}
export type StockLot = { quantity: number; expiryDate: string };
export type IncomingLot = {
  quantity: number;
  date: string | null;
  expiryDate?: string | null;
  confirmed: boolean;
  reference: string;
};
export type PlanningRow = {
  inventoryId: string;
  drugId: string;
  drugName: string;
  scientificName: string;
  barcode: string;
  branchId: string;
  branchName: string;
  minStock: number;
  maxStock: number;
  cost: number | null;
  unitsPerPack: number | null;
  sold: number;
  returned: number;
  observedDays: number;
  lots: StockLot[];
  incoming: IncomingLot[];
  qualityReasons: string[];
};
export type PlanningOptions = {
  coverageDays: number;
  leadDays: number;
  safetyDays: number;
  fromArrival: boolean;
};
export function validatePlanningOptions(o: PlanningOptions) {
  if (
    ![o.coverageDays, o.leadDays, o.safetyDays].every(Number.isSafeInteger) ||
    o.coverageDays < 1 ||
    o.coverageDays > 365 ||
    o.leadDays < 0 ||
    o.leadDays > 180 ||
    o.safetyDays < 0 ||
    o.safetyDays > 90
  )
    throw new Error("أيام التغطية أو التوريد أو الأمان خارج النطاق");
}
export function planRow(
  row: PlanningRow,
  options: PlanningOptions,
  today: string,
) {
  validatePlanningOptions(options);
  const netSales = Math.max(0, row.sold - row.returned);
  const rate = row.observedDays > 0 ? netSales / row.observedDays : 0;
  const start = dateStart(today).getTime();
  const horizon =
    options.coverageDays + (options.fromArrival ? options.leadDays : 0);
  const current = row.lots
    .filter((l) => l.expiryDate >= today)
    .reduce((s, l) => s + Math.max(0, l.quantity), 0);
  const pending = row.incoming.reduce((s, l) => s + Math.max(0, l.quantity), 0);
  // Inventory cannot become negative. Lost demand before arrival is not a backorder.
  const simulate = (order: number) => {
    const lots = row.lots
      .filter((l) => l.quantity > 0 && l.expiryDate >= today)
      .map((l) => ({ ...l }));
    let lost = 0,
      preArrivalLost = 0,
      expired = 0;
    for (let day = 0; day < horizon; day++) {
      const date = baghdadDate(new Date(start + day * DAY));
      for (const lot of lots)
        if (lot.expiryDate < date) {
          expired += lot.quantity;
          lot.quantity = 0;
        }
      for (const lot of row.incoming)
        if (
          lot.confirmed &&
          lot.date === date &&
          (!lot.expiryDate || lot.expiryDate >= date)
        )
          lots.push({
            quantity: lot.quantity,
            expiryDate: lot.expiryDate || "9999-12-31",
          });
      if (day === options.leadDays && order > 0)
        lots.push({ quantity: order, expiryDate: "9999-12-31" });
      lots.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      let demand = rate;
      for (const lot of lots) {
        const used = Math.min(lot.quantity, demand);
        lot.quantity -= used;
        demand -= used;
        if (demand <= 1e-9) break;
      }
      lost += Math.max(0, demand);
      if (day < options.leadDays) preArrivalLost += Math.max(0, demand);
    }
    return {
      remaining: lots.reduce((s, l) => s + l.quantity, 0),
      lost,
      preArrivalLost,
      expired,
    };
  };
  const baseline = simulate(0);
  const safety = rate * options.safetyDays;
  let suggestedQty = 0;
  if (rate > 0 && options.leadDays < horizon) {
    let lo = 0,
      hi = Math.ceil(rate * (horizon + options.safetyDays));
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2),
        result = simulate(mid);
      if (
        result.lost - result.preArrivalLost > 1e-7 ||
        result.remaining + 1e-7 < safety
      )
        lo = mid + 1;
      else hi = mid;
    }
    suggestedQty = lo;
  }
  const coverage = rate > 0 ? current / rate : null;
  const packs = row.unitsPerPack
    ? Math.ceil(suggestedQty / row.unitsPerPack)
    : null;
  return {
    ...row,
    currentStock: current,
    totalSoldLast30Days: netSales,
    netSales,
    averageDailySales: rate,
    suggestedQty,
    coverage,
    pending,
    packs,
    expiredUnits: baseline.expired,
    urgentUnits: Math.ceil(Math.max(0, baseline.preArrivalLost - 1e-7)),
    shortageUnits: Math.ceil(Math.max(0, baseline.lost - 1e-7)),
    noDemand: rate === 0,
    low: current < row.minStock,
    out: current === 0,
    insufficient: baseline.lost > 1e-7 || baseline.remaining + 1e-7 < safety,
    action:
      current === 0 ||
      current < row.minStock ||
      suggestedQty > 0 ||
      baseline.lost > 1e-7,
  };
}
