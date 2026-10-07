// Frozen pre-optimization oracle; deliberately retains the original daily arithmetic.
import { dateStart, baghdadDate, DAY, type PlanningRow, type StockSimulation, type PlanningOptions, validatePlanningOptions, saleRate } from '../../smart-purchasing';
export function referenceSimulation(
  row: Pick<PlanningRow, "lots" | "incoming">,
  rate: number,
  horizon: number,
  leadDays: number,
  order: number,
  today: string,
): StockSimulation {
  const start = dateStart(today).getTime();
  // src: index in row.lots; -1 incoming lot; -2 the simulated order.
  const lots = row.lots
    .map((l, i) => ({ quantity: l.quantity, expiryDate: l.expiryDate, src: i }))
    .filter((l) => l.quantity > 0 && l.expiryDate >= today);
  const expiredByLot = row.lots.map(() => 0);
  let lost = 0,
    preArrivalLost = 0,
    expired = 0,
    expiredIncoming = 0;
  for (let day = 0; day < horizon; day++) {
    const date = baghdadDate(new Date(start + day * DAY));
    for (const lot of lots)
      if (lot.expiryDate < date) {
        expired += lot.quantity;
        if (lot.src >= 0) expiredByLot[lot.src] += lot.quantity;
        else if (lot.src === -1) expiredIncoming += lot.quantity;
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
          src: -1,
        });
    if (day === leadDays && order > 0)
      lots.push({ quantity: order, expiryDate: "9999-12-31", src: -2 });
    lots.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
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

export function referencePlanRow(
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
    referenceSimulation(row, rate, horizon, options.leadDays, order, today);
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
