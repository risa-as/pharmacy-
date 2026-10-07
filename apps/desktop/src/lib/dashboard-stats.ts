// Dashboard numbers from the two local handlers (pure, unit-tested).
// The handlers answer an error with an empty result and success:false; that must
// count as a failed refresh, never as "zero sales today" saved over good numbers.

export interface DashboardStats {
    todaySales: number;
    todayCount: number;
    todayItems: number;
    lowStockCount: number;
    recentSales: any[];
    lowStockProducts: any[];
}

/** The stats to show, or null when either source failed (keep the last good ones). */
export function buildDashboardStats(sales: any, lowStock: any): DashboardStats | null {
    if (!sales || sales.success === false || !lowStock || lowStock.success === false) return null;
    return {
        todaySales: sales.total || 0,
        todayCount: sales.count || 0,
        todayItems: sales.items || 0,
        lowStockCount: lowStock.count || 0,
        recentSales: (sales.sales || []).slice(0, 5),
        lowStockProducts: lowStock.items || [],
    };
}
