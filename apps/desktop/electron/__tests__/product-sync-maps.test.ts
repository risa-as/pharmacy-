import { describe, expect, it } from 'vitest';
import {
    removeInventoryIdsFromProductSyncMaps,
    setDrugInventoriesInProductSyncMaps,
    upsertBatchInProductSyncMaps,
    type ProductSyncMaps,
} from '../product-sync-maps';

function makeMaps(): ProductSyncMaps {
    return {
        inventoriesByDrugId: new Map([
            ['drug-1', [
                { id: 'inv-1', drugId: 'drug-1' },
                { id: 'inv-2', drugId: 'drug-1' },
            ]],
        ]),
        batchesByInventoryId: new Map([
            ['inv-1', [{ id: 'batch-1', inventoryId: 'inv-1', quantity: 5 }]],
            ['inv-2', [{ id: 'batch-2', inventoryId: 'inv-2', quantity: 7 }]],
        ]),
        batchesById: new Map([
            ['batch-1', { id: 'batch-1', inventoryId: 'inv-1', quantity: 5 }],
            ['batch-2', { id: 'batch-2', inventoryId: 'inv-2', quantity: 7 }],
        ]),
    };
}

describe('product sync map helpers', () => {
    it('removes deleted inventories and their batches from every map', () => {
        const maps = makeMaps();

        removeInventoryIdsFromProductSyncMaps(maps, ['inv-2']);

        expect(maps.inventoriesByDrugId.get('drug-1')).toEqual([{ id: 'inv-1', drugId: 'drug-1' }]);
        expect(maps.batchesByInventoryId.has('inv-2')).toBe(false);
        expect(maps.batchesById.has('batch-2')).toBe(false);
        expect(maps.batchesById.has('batch-1')).toBe(true);
    });

    it('moves a batch between inventory lists when an update changes inventoryId', () => {
        const maps = makeMaps();

        upsertBatchInProductSyncMaps(maps, {
            id: 'batch-2',
            inventoryId: 'inv-1',
            quantity: 8,
        });

        expect(maps.batchesByInventoryId.get('inv-2')).toBeUndefined();
        expect(maps.batchesByInventoryId.get('inv-1')?.map((batch) => batch.id)).toEqual(['batch-1', 'batch-2']);
        expect(maps.batchesById.get('batch-2')).toEqual({
            id: 'batch-2',
            inventoryId: 'inv-1',
            quantity: 8,
        });
    });

    it('deletes a drug inventory map entry when no inventories remain', () => {
        const maps = makeMaps();

        setDrugInventoriesInProductSyncMaps(maps, 'drug-1', []);

        expect(maps.inventoriesByDrugId.has('drug-1')).toBe(false);
    });
});
