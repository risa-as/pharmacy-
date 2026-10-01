import { baghdadDate, dateStart } from './smart-purchasing';
export { monthlyStockoutRequest } from '../../../../packages/shared/src/assistant/purchase-intent';

/** Includes sales up to now; denominator is calendar days including the partial current day. */
export function currentMonthPeriod(now: Date) {
    const to = baghdadDate(now);
    const from = to.slice(0, 8) + '01';
    return { from, to, start: dateStart(from), end: now, days: Number(to.slice(8, 10)) };
}
