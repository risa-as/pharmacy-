export type RefundLine = { drugId: string; quantity: number; price: number };
export type RefundSale = { total: number; items: RefundLine[]; returns?: { total?: number; items: { drugId: string; quantity: number }[] }[] };
/** Allocate the actual invoice total, including discount, in cents. Cumulative
 * rounding makes successive partial refunds sum to the original paid total. */
export function calculateRefund(sale: RefundSale, requested: { drugId: string; quantity: number }[]) {
    const groups = new Map<string, { quantity: number; gross: number; returned: number; cents: number }>();
    for (const i of sale.items) {
        const g = groups.get(i.drugId) ?? { quantity: 0, gross: 0, returned: 0, cents: 0 };
        g.quantity += i.quantity; g.gross += i.price * i.quantity; groups.set(i.drugId, g);
    }
    for (const r of sale.returns ?? []) for (const i of r.items) {
        const g = groups.get(i.drugId); if (g) g.returned += i.quantity;
    }
    const gross = [...groups.values()].reduce((s, g) => s + g.gross, 0);
    const paid = Math.max(0, Math.round(sale.total * 100));
    let cumulative = 0, allocated = 0;
    for (const [, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        cumulative += g.gross;
        const end = gross > 0 ? Math.round(paid * cumulative / gross) : 0;
        g.cents = end - allocated; allocated = end;
    }
    const seen = new Set<string>();
    let remaining = Math.max(0, paid - Math.round((sale.returns ?? []).reduce((s, r) => s + (r.total ?? 0), 0) * 100));
    const items = requested.map(i => {
        const g = groups.get(i.drugId);
        if (!g || seen.has(i.drugId) || !Number.isInteger(i.quantity) || i.quantity <= 0 || i.quantity > g.quantity - g.returned)
            throw new Error('كمية الإرجاع غير صالحة أو تتجاوز المتاح من الفاتورة.');
        seen.add(i.drugId);
        const cents = Math.min(remaining, Math.max(0, Math.round(g.cents * (g.returned + i.quantity) / g.quantity) - Math.round(g.cents * g.returned / g.quantity)));
        remaining -= cents;
        return { drugId: i.drugId, quantity: i.quantity, price: cents / 100 / i.quantity };
    });
    return { items, total: Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100 };
}
export function previewRefund(sale: RefundSale | null | undefined, quantities: Record<string, number>) {
    if (!sale) return 0;
    try { return calculateRefund(sale, Object.entries(quantities).filter(([, q]) => q > 0).map(([drugId, quantity]) => ({ drugId, quantity }))).total; }
    catch { return 0; }
}
