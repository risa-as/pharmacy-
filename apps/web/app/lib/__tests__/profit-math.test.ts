import { describe, expect, it } from 'vitest';
import { returnedCost, saleMargin } from '../profit-math';
describe('profit using recorded sale cost', () => {
  it('deducts cost and respects the invoice total after discount', () => {
    expect(saleMargin({ total: 90, items: [{ quantity: 1, cost: 70 }] })).toBe(20);
  });
  it('reverses only the cost of returned units including mixed cost lines', () => {
    expect(returnedCost([{ drugId: 'a', quantity: 2 }], [
      { drugId: 'a', quantity: 1, cost: 40 }, { drugId: 'a', quantity: 3, cost: 80 },
    ])).toBe(140);
  });
  it('a full sale and its full refund have zero margin', () => {
    const items = [{ drugId: 'a', quantity: 2, cost: 70 }];
    expect(saleMargin({ total: 190, items }) - 190 + returnedCost(items, items)).toBe(0);
  });
});
