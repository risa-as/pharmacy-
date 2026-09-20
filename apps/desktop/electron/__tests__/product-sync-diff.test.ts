import { describe, expect, it } from 'vitest';
import {
    changedProductSyncData,
    hasChangedProductSyncData,
    productSyncValuesEqual,
} from '../product-sync-diff';

describe('product sync diff helpers', () => {
    it('treats equal dates as unchanged even when they are different instances', () => {
        const current = new Date('2026-09-20T10:00:00.000Z');
        const incoming = new Date('2026-09-20T10:00:00.000Z');

        expect(productSyncValuesEqual(current, incoming)).toBe(true);
    });

    it('omits undefined fields so older product snapshots do not clear local values', () => {
        const changes = changedProductSyncData(
            {
                tradeName: 'Aspirin',
                unitsPerPack: 10,
                unitsPerPackConfirmedAt: new Date('2026-09-20T10:00:00.000Z'),
            },
            {
                tradeName: 'Aspirin',
                unitsPerPack: undefined,
                unitsPerPackConfirmedAt: undefined,
            },
        );

        expect(changes).toEqual({});
    });

    it('returns only the changed fields from a repeated full product snapshot', () => {
        const changes = changedProductSyncData(
            {
                barcode: '123',
                tradeName: 'Aspirin',
                price: 1000,
                isQuickSale: false,
                expiryDate: new Date('2026-12-31T00:00:00.000Z'),
            },
            {
                barcode: '123',
                tradeName: 'Aspirin Plus',
                price: 1000,
                isQuickSale: false,
                expiryDate: new Date('2026-12-31T00:00:00.000Z'),
            },
        );

        expect(changes).toEqual({ tradeName: 'Aspirin Plus' });
    });

    it('reports no changes when a snapshot row already matches local data', () => {
        expect(hasChangedProductSyncData(
            {
                quantity: 12,
                branchId: 'branch-1',
                costPrice: 500,
                minStock: 2,
                maxStock: 40,
            },
            {
                quantity: 12,
                branchId: 'branch-1',
                costPrice: 500,
                minStock: 2,
                maxStock: 40,
            },
        )).toBe(false);
    });
});
