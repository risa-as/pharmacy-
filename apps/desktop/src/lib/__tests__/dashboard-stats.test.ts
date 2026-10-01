import { describe, expect, it } from 'vitest';
import { buildDashboardStats } from '../dashboard-stats';

describe('dashboard stats', () => {
    it('builds the numbers from both sources', () => {
        const s = buildDashboardStats({ total: 1500, count: 3, items: 7, sales: [1, 2, 3, 4, 5, 6] }, { count: 2, items: [{ id: 'a' }, { id: 'b' }] });
        expect(s).toEqual({ todaySales: 1500, todayCount: 3, todayItems: 7, lowStockCount: 2, recentSales: [1, 2, 3, 4, 5], lowStockProducts: [{ id: 'a' }, { id: 'b' }] });
    });
    it('a failed source is a failed refresh, not zeros', () => {
        const ok = { total: 1, count: 1, items: 1, sales: [] };
        expect(buildDashboardStats({ success: false, total: 0, count: 0, items: 0, sales: [] }, { count: 0, items: [] })).toBeNull();
        expect(buildDashboardStats(ok, { success: false, count: 0, items: [] })).toBeNull();
        expect(buildDashboardStats(undefined, { count: 0, items: [] })).toBeNull();
        expect(buildDashboardStats(ok, null)).toBeNull();
    });
    it('a real empty day is still a success', () => {
        expect(buildDashboardStats({ total: 0, count: 0, items: 0, sales: [] }, { count: 0, items: [] })).toMatchObject({ todaySales: 0, lowStockCount: 0 });
    });
});
