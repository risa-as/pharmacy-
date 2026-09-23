import { describe, it, expect, vi } from 'vitest';
import { recentPeriod, validateSettings, matchesPlanningFilter, PlanningItem } from './smart-planning';
const settings = { from: '2026-08-01', to: '2026-09-20', coverageDays: 7, leadDays: 1, safetyDays: 0, fromArrival: false };
describe('mobile purchasing analysis settings', () => {
 it('uses Baghdad completed days across UTC midnight', () => {
  expect(recentPeriod(7, new Date('2026-09-20T22:00:00Z'))).toEqual({from:'2026-09-14',to:'2026-09-20'});
 });
 it('accepts zero lead and safety without treating them as missing', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T10:00:00Z'));
  try { expect(validateSettings({...settings, leadDays:0})).toBeNull(); } finally { vi.useRealTimers(); }
 });
 it.each([{from:'2026-02-30'}, {to:'2026-07-01'}, {coverageDays:0}, {leadDays:-1}, {safetyDays:91}, {coverageDays:1.5}, {leadDays:NaN}])('rejects invalid analysis input %j', patch => {
  expect(validateSettings({...settings, ...patch})).not.toBeNull();
 });
 it('shows no-demand out-of-stock items and unconfirmed incoming separately', () => {
  const row = {out:true,noDemand:true,qualityReasons:[],incoming:[{quantity:0,confirmed:false}],urgentUnits:0,action:true} as unknown as PlanningItem;
  expect(matchesPlanningFilter(row,'out')).toBe(true);
  expect(matchesPlanningFilter(row,'review')).toBe(true);
  expect(matchesPlanningFilter(row,'pending')).toBe(true);
  expect(matchesPlanningFilter(row,'urgent')).toBe(false);
 });
});
