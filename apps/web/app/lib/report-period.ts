// Shared date-range helpers for reports. Used by the profits report page and
// its Excel export route so both interpret from/to/fromTime/toTime identically
// (Baghdad / UTC+3).

const IRAQ_OFFSET = 3 * 60 * 60 * 1000;

export function buildDateRange(
  from?: string,
  to?: string,
  fromTime?: string,
  toTime?: string,
) {
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
  let start: Date, end: Date, label: string;
  if (from && to) {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    // Parse as Baghdad dates → convert to UTC (full days for DB; time-of-day filtered in JS)
    start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
    end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
    label =
      fromTime || toTime
        ? `${from} — ${to} (${fromTime || "00:00"} → ${toTime || "23:59"})`
        : `${from} — ${to}`;
  } else {
    const todayUtcIraq = Date.UTC(
      nowIraq.getUTCFullYear(),
      nowIraq.getUTCMonth(),
      nowIraq.getUTCDate(),
    );
    end = new Date(todayUtcIraq + 24 * 60 * 60 * 1000 - 1 - IRAQ_OFFSET);
    start = new Date(todayUtcIraq - 6 * 24 * 60 * 60 * 1000 - IRAQ_OFFSET);
    label = "آخر 7 أيام";
  }
  return { start, end, label };
}

export function filterByTimeOfDay<T extends { createdAt: Date | string }>(
  items: T[],
  fromTime?: string,
  toTime?: string,
): T[] {
  if (!fromTime && !toTime) return items;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fromMin = fromTime ? toMinutes(fromTime) : 0;
  const toMin = toTime ? toMinutes(toTime) : 23 * 60 + 59;
  const crossesMidnight = fromMin > toMin;
  return items.filter((item) => {
    const d = new Date(item.createdAt);
    const iraqTime = new Date(d.getTime() + IRAQ_OFFSET);
    const min = iraqTime.getUTCHours() * 60 + iraqTime.getUTCMinutes();
    return crossesMidnight
      ? min >= fromMin || min <= toMin
      : min >= fromMin && min <= toMin;
  });
}
