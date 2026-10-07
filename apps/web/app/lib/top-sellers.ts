import type { Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';

type Qty = { drugId: string; quantity: number };

export type TopSeller = {
    drugId: string;
    name: string;
    barcode: string;
    /** Units sold in the period minus the units later returned from those same sales. */
    quantity: number;
    /** Sales value minus the refunded value of those returns (only when asked for). */
    revenue: number;
};

/** Sold minus returned per drug, keeping only drugs with units left, highest first. */
export function netQuantities(sold: Qty[], returned: Qty[]): Qty[] {
    const net = new Map<string, number>();
    for (const row of sold) net.set(row.drugId, (net.get(row.drugId) ?? 0) + row.quantity);
    for (const row of returned) if (net.has(row.drugId)) net.set(row.drugId, net.get(row.drugId)! - row.quantity);
    return Array.from(net, ([drugId, quantity]) => ({ drugId, quantity }))
        .filter((row) => row.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity);
}

/** The first `limit` rows plus every row tied with the last one: the names decide among those. */
export function tieCandidates(ranked: Qty[], limit: number): Qty[] {
    if (ranked.length <= limit) return ranked;
    const cut = ranked[limit - 1].quantity;
    return ranked.filter((row, i) => i < limit || row.quantity === cut);
}

/** Equal quantities are ordered by name (then id), so the list does not reshuffle between loads. */
export function orderTopSellers<T extends { drugId: string; name: string; quantity: number }>(rows: T[], limit: number): T[] {
    return [...rows]
        .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'en') || a.drugId.localeCompare(b.drugId))
        .slice(0, limit);
}

/**
 * Best sellers for sales made since `since` within `saleScope` (tenant/branch filter on Sale).
 * Returns count against the period of the sale they came from, as in smart purchasing.
 * Quantities are grouped in the database; revenue is read only for the final rows.
 */
export async function getTopSellers({ saleScope, since, limit, withRevenue = false }: {
    saleScope: Prisma.SaleWhereInput; since: Date; limit: number; withRevenue?: boolean;
}): Promise<TopSeller[]> {
    const sale: Prisma.SaleWhereInput = { AND: [saleScope, { createdAt: { gte: since } }] };
    const [sold, returned] = await Promise.all([
        prisma.saleItem.groupBy({ by: ['drugId'], where: { sale }, _sum: { quantity: true } }),
        prisma.saleReturnItem.groupBy({ by: ['drugId'], where: { saleReturn: { sale } }, _sum: { quantity: true } }),
    ]);
    const toQty = (rows: { drugId: string; _sum: { quantity: number | null } }[]) =>
        rows.map((row) => ({ drugId: row.drugId, quantity: row._sum.quantity ?? 0 }));
    const candidates = tieCandidates(netQuantities(toQty(sold), toQty(returned)), limit);
    if (!candidates.length) return [];

    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: candidates.map((row) => row.drugId) } },
        select: { id: true, tradeName: true, barcode: true },
    });
    const names = new Map(drugs.map((d) => [d.id, d]));
    const top = orderTopSellers(candidates.map((row) => ({
        ...row,
        name: names.get(row.drugId)?.tradeName || 'غير معروف',
        barcode: names.get(row.drugId)?.barcode || '',
        revenue: 0,
    })), limit);
    if (!withRevenue) return top;

    const ids = top.map((row) => row.drugId);
    const [soldLines, returnedLines] = await Promise.all([
        prisma.saleItem.findMany({ where: { drugId: { in: ids }, sale }, select: { drugId: true, quantity: true, price: true } }),
        prisma.saleReturnItem.findMany({ where: { drugId: { in: ids }, saleReturn: { sale } }, select: { drugId: true, quantity: true, price: true } }),
    ]);
    const revenue = new Map<string, number>();
    for (const line of soldLines) revenue.set(line.drugId, (revenue.get(line.drugId) ?? 0) + line.quantity * line.price);
    for (const line of returnedLines) revenue.set(line.drugId, (revenue.get(line.drugId) ?? 0) - line.quantity * line.price);
    return top.map((row) => ({ ...row, revenue: revenue.get(row.drugId) ?? 0 }));
}
