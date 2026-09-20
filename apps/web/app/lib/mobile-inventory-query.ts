import { Prisma } from '@prisma/client';
import { buildTenantBranchCondition, normalizeInventoryDashboardPage } from './inventory-dashboard-query';

export const MOBILE_INVENTORY_PAGE_SIZE = 50;
export type MobileInventorySummary = {
    ids: string[];
    total: number;
    totalValue: number;
    counts: Record<'all' | 'low-stock' | 'out' | 'near-expiry' | 'expired', number>;
};

export function buildMobileInventoryQuery(params: URLSearchParams, tenantWhere: Record<string, any>, now = new Date()) {
    const page = normalizeInventoryDashboardPage(params.get('page'));
    // Mobile search uses literal substring matching, including % and _.
    const search = params.get('search') ?? '';
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const searchWhere = search ? Prisma.sql`("tradeName" ILIKE ${pattern} OR "barcode" LIKE ${pattern})` : Prisma.sql`TRUE`;
    const status = params.get('status');
    const stockWhere = status === 'low-stock' ? Prisma.sql`quantity > 0 AND quantity <= "minStock"`
        : status === 'out' ? Prisma.sql`quantity <= 0`
        : status === 'near-expiry' ? Prisma.sql`days >= 0 AND days < 120`
        : status === 'expired' ? Prisma.sql`days < 0` : Prisma.sql`TRUE`;
    const sort = params.get('sort');
    const sortColumn = sort === 'quantity' ? Prisma.sql`quantity`
        : sort === 'expiry' ? Prisma.sql`COALESCE(days, 9999)` : Prisma.sql`"tradeName"`;
    const direction = params.get('direction') === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    return Prisma.sql`
        WITH stock AS (
            SELECT i.id, i."minStock", i.price, gd."tradeName", gd.barcode,
                COALESCE(SUM(bat.quantity), 0)::double precision AS quantity,
                CEIL(EXTRACT(EPOCH FROM (MIN(bat."expiryDate") FILTER (WHERE bat.quantity > 0)
                    - ${now.toISOString()}::timestamp)) / 86400) AS days
            FROM "Inventory" i
            JOIN "GlobalDrug" gd ON gd.id = i."drugId"
            JOIN "Branch" br ON br.id = i."branchId"
            LEFT JOIN "Batch" bat ON bat."inventoryId" = i.id
            WHERE ${buildTenantBranchCondition(tenantWhere, params.get('branchId') || undefined)}
            GROUP BY i.id, i."minStock", i.price, gd."tradeName", gd.barcode
        ), filtered AS (
            SELECT * FROM stock WHERE ${searchWhere} AND (${stockWhere})
        ), page AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY ${sortColumn} ${direction}, id ASC) AS position
            FROM filtered ORDER BY ${sortColumn} ${direction}, id ASC
            LIMIT ${MOBILE_INVENTORY_PAGE_SIZE} OFFSET ${(page - 1) * MOBILE_INVENTORY_PAGE_SIZE}
        )
        SELECT
            COALESCE((SELECT json_agg(id ORDER BY position) FROM page), '[]'::json) AS ids,
            (SELECT COUNT(*)::integer FROM filtered) AS total,
            COALESCE(SUM(quantity * price), 0)::double precision AS "totalValue",
            json_build_object(
                'all', COUNT(*),
                'low-stock', COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= "minStock"),
                'out', COUNT(*) FILTER (WHERE quantity <= 0),
                'near-expiry', COUNT(*) FILTER (WHERE days >= 0 AND days < 120),
                'expired', COUNT(*) FILTER (WHERE days < 0)
            ) AS counts
        FROM stock
    `;
}
