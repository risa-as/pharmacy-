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
/** Net sales per observed day (returns subtracted), the rate every simulation uses. */
export function saleRate(row: Pick<PlanningRow, "sold" | "returned" | "observedDays">) {
  const netSales = Math.max(0, row.sold - row.returned);
  return row.observedDays > 0 ? netSales / row.observedDays : 0;
}
export type StockSimulation = {
  remaining: number;
  lost: number;
  preArrivalLost: number;
  expired: number;
  /** Units of row.lots[i] expected to expire unsold (same index as row.lots). */
  expiredByLot: number[];
  /** Units of incoming lots expected to expire unsold (no batch cost yet). */
  expiredIncoming: number;
};
/**
 * Day-by-day first-expiry-first-out simulation over the horizon. Inventory
 * cannot become negative. Lost demand before arrival is not a backorder.
 * An optional order arrives on day leadDays and never expires.
 */
export function simulateStock(
  row: Pick<PlanningRow, "lots" | "incoming">,
  rate: number,
  horizon: number,
  leadDays: number,
  order: number,
  today: string,
): StockSimulation {
  const start = dateStart(today).getTime();
  // Calendar conversion and sorting happen per lot/arrival, not for every day
  // of every binary-search simulation. Daily arithmetic remains unchanged.
  const dayOf = (date: string) => date === "9999-12-31" ? Infinity
    : Math.round((Date.parse(date + "T00:00:00+03:00") - start) / DAY);
  const lots = row.lots
    .map((l, i) => ({ quantity: l.quantity, expiryDate: l.expiryDate, expiryDay: dayOf(l.expiryDate), src: i }))
    .filter(l => l.quantity > 0 && l.expiryDate >= today);
  type Lot = (typeof lots)[number];
  const arrivals = new Map<number, Lot[]>();
  for (const lot of row.incoming) {
    if (!lot.confirmed || !lot.date || (lot.expiryDate && lot.expiryDate < lot.date)) continue;
    const day = dayOf(lot.date);
    if (day < 0 || day >= horizon) continue;
    const incoming = { quantity: lot.quantity, expiryDate: lot.expiryDate || "9999-12-31", expiryDay: dayOf(lot.expiryDate || "9999-12-31"), src: -1 };
    const existing = arrivals.get(day);
    if (existing) existing.push(incoming); else arrivals.set(day, [incoming]);
  }
  const byExpiry = (a: Lot, b: Lot) => a.expiryDate.localeCompare(b.expiryDate);
  lots.sort(byExpiry);
  const expiredByLot = row.lots.map(() => 0);
  let lost = 0, preArrivalLost = 0, expired = 0, expiredIncoming = 0;
  for (let day = 0; day < horizon; day++) {
    for (const lot of lots) if (lot.expiryDay < day) {
      expired += lot.quantity;
      if (lot.src >= 0) expiredByLot[lot.src] += lot.quantity;
      else if (lot.src === -1) expiredIncoming += lot.quantity;
      lot.quantity = 0;
    }
    const incoming = arrivals.get(day);
    if (incoming) lots.push(...incoming);
    const ordered = day === leadDays && order > 0;
    if (ordered) lots.push({ quantity: order, expiryDate: "9999-12-31", expiryDay: Infinity, src: -2 });
    if (incoming || ordered) lots.sort(byExpiry);
    let demand = rate;
    for (const lot of lots) {
      const used = Math.min(lot.quantity, demand);
      lot.quantity -= used;
      demand -= used;
      if (demand <= 1e-9) break;
    }
    lost += Math.max(0, demand);
    if (day < leadDays) preArrivalLost += Math.max(0, demand);
  }
  return {
    remaining: lots.reduce((s, l) => s + l.quantity, 0),
    lost,
    preArrivalLost,
    expired,
    expiredByLot,
    expiredIncoming,
  };
}
export function planRow(
  row: PlanningRow,
  options: PlanningOptions,
  today: string,
) {
  validatePlanningOptions(options);
  const netSales = Math.max(0, row.sold - row.returned);
  const rate = saleRate(row);
  const horizon =
    options.coverageDays + (options.fromArrival ? options.leadDays : 0);
  const current = row.lots
    .filter((l) => l.expiryDate >= today)
    .reduce((s, l) => s + Math.max(0, l.quantity), 0);
  const pending = row.incoming.reduce((s, l) => s + Math.max(0, l.quantity), 0);
  const simulate = (order: number) =>
    simulateStock(row, rate, horizon, options.leadDays, order, today);
  const baseline = simulate(0);
  const safety = rate * options.safetyDays;
  let suggestedQty = 0;
  // Zero is already the minimal order when stock covers post-arrival demand
  // and safety. Avoid repeating the same simulation through a binary search.
  if (rate > 0 && options.leadDays < horizon &&
    (baseline.lost - baseline.preArrivalLost > 1e-7 || baseline.remaining + 1e-7 < safety)) {
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
