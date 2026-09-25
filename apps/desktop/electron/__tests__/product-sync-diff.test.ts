import { describe, expect, it } from 'vitest';
import {
    changedProductSyncData,
    hasChangedProductSyncData,
    mergePendingInventoryUpdatePayload,
    productSyncValuesEqual,
    shouldPreservePendingPackUnits,
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

    it('preserves a locally confirmed pack count while a pending inventory edit has stale cloud data', () => {
        expect(shouldPreservePendingPackUnits({
            hasPendingLocalEdits: true,
            localUnitsPerPack: 4,
            localUnitsPerPackConfirmedAt: new Date('2026-09-24T10:00:00.000Z'),
            cloudUnitsPerPack: 3,
            cloudUnitsPerPackConfirmedAt: new Date('2026-09-23T10:00:00.000Z'),
        })).toBe(true);
    });

    it('allows pending pack sync to clear once cloud echoes the confirmed count', () => {
        expect(shouldPreservePendingPackUnits({
            hasPendingLocalEdits: true,
            localUnitsPerPack: 4,
            localUnitsPerPackConfirmedAt: new Date('2026-09-24T10:00:00.000Z'),
            cloudUnitsPerPack: 4,
            cloudUnitsPerPackConfirmedAt: new Date('2026-09-24T10:01:00.000Z'),
        })).toBe(false);
    });

    it('keeps a queued pack edit when a newer inventory update omits unitsPerPack', () => {
        expect(mergePendingInventoryUpdatePayload(
            { inventoryId: 'i1', costPrice: 100, unitsPerPack: 4 },
            { inventoryId: 'i1', costPrice: 120 },
        )).toEqual({ inventoryId: 'i1', costPrice: 120, unitsPerPack: 4 });
    });

    it('lets a newer queued pack edit replace an earlier pack value', () => {
        expect(mergePendingInventoryUpdatePayload(
            { inventoryId: 'i1', costPrice: 100, unitsPerPack: 4 },
            { inventoryId: 'i1', costPrice: 120, unitsPerPack: 6 },
        )).toEqual({ inventoryId: 'i1', costPrice: 120, unitsPerPack: 6 });
    });
});
