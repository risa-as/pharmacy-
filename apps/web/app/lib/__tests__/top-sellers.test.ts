import { expect, it } from 'vitest';
import { netQuantities, orderTopSellers, tieCandidates } from '../top-sellers';

it('subtracts returned units and drops drugs fully returned', () => {
    const sold = [{ drugId: 'a', quantity: 23 }, { drugId: 'b', quantity: 15 }, { drugId: 'c', quantity: 4 }];
    const returned = [{ drugId: 'a', quantity: 10 }, { drugId: 'c', quantity: 4 }, { drugId: 'x', quantity: 2 }];
    expect(netQuantities(sold, returned)).toEqual([{ drugId: 'b', quantity: 15 }, { drugId: 'a', quantity: 13 }]);
});

it('keeps every row tied with the last place so names can decide', () => {
    const ranked = [{ drugId: 'a', quantity: 9 }, { drugId: 'b', quantity: 5 }, { drugId: 'c', quantity: 5 }, { drugId: 'd', quantity: 5 }, { drugId: 'e', quantity: 1 }];
    expect(tieCandidates(ranked, 2).map((r) => r.drugId)).toEqual(['a', 'b', 'c', 'd']);
    expect(tieCandidates(ranked, 10)).toBe(ranked);
});

it('orders equal quantities by name, the same on every load', () => {
    const rows = [
        { drugId: '2', name: 'Vitamin D3', quantity: 5 },
        { drugId: '1', name: 'Capoten 25mg', quantity: 5 },
        { drugId: '3', name: 'Centrum', quantity: 15 },
    ];
    expect(orderTopSellers(rows, 2).map((r) => r.name)).toEqual(['Centrum', 'Capoten 25mg']);
    expect(orderTopSellers([...rows].reverse(), 3)).toEqual(orderTopSellers(rows, 3));
});
