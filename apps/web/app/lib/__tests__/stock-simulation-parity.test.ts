import { expect, it } from 'vitest';
import { simulateStock, planRow, baghdadDate, DAY } from '../smart-purchasing';
import { referenceSimulation, referencePlanRow } from './fixtures/stock-simulation-reference';
it('matches original FEFO simulation across 20000 deterministic cases, including ties, returns-rate fractions, expiry and deliveries', () => {
    let seed = 21871;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const int = (n: number) => Math.floor(rnd() * n);
    const today = '2026-09-30'; const base = new Date(today + 'T00:00:00+03:00').getTime();
    const date = (n: number) => baghdadDate(new Date(base + n * DAY));
    for (let i = 0; i < 20000; i++) {
        const row = {
            lots: Array.from({ length: int(8) }, () => ({ quantity: int(200) / 3, expiryDate: date(int(100) - 5) })),
            incoming: Array.from({ length: int(6) }, () => ({ quantity: int(100), date: rnd() < .1 ? null : date(int(60) - 3), expiryDate: rnd() < .2 ? null : date(int(120)), confirmed: rnd() > .2, reference: '' })),
        };
        const args = [row, int(100) / 7, int(120) + 1, int(30), int(100), today] as const;
        expect(simulateStock(...args)).toEqual(referenceSimulation(...args));
        if (i < 2000) {
            const full = { ...row, inventoryId: 'i', drugId: 'd', drugName: 'D', scientificName: '', barcode: '', branchId: 'b', branchName: 'B',
                minStock: int(10), maxStock: 100, cost: 10, unitsPerPack: 12, sold: int(100), returned: int(10), observedDays: 30, qualityReasons: [] };
            const options = { coverageDays: int(365) + 1, leadDays: int(180), safetyDays: int(90), fromArrival: rnd() < .5 };
            expect(planRow(full, options, today)).toEqual(referencePlanRow(full, options, today));
        }
    }
}, 60000);
