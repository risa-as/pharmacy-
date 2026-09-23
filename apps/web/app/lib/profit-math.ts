type CostLine = { drugId: string; quantity: number; cost: number };
/** Historical invoices may have several prices/costs for one drug. */
export function returnedCost(items: { drugId: string; quantity: number }[], sold: CostLine[]): number {
  return items.reduce((sum, item) => {
    const lines = sold.filter(line => line.drugId === item.drugId);
    const quantity = lines.reduce((n, line) => n + line.quantity, 0);
    const cost = lines.reduce((n, line) => n + line.cost * line.quantity, 0);
    return sum + (quantity > 0 ? cost / quantity * item.quantity : 0);
  }, 0);
}
export function saleMargin(sale: { total: number; items: { cost: number; quantity: number }[] }): number {
  return sale.total - sale.items.reduce((sum, item) => sum + item.cost * item.quantity, 0);
}
