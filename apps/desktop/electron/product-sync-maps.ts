export type ProductSyncInventoryMapRow = {
    id: string;
    drugId?: string | null;
    [key: string]: any;
};

export type ProductSyncBatchMapRow = {
    id: string;
    inventoryId: string;
    [key: string]: any;
};

export type ProductSyncMaps = {
    inventoriesByDrugId: Map<string, ProductSyncInventoryMapRow[]>;
    batchesByInventoryId: Map<string, ProductSyncBatchMapRow[]>;
    batchesById: Map<string, ProductSyncBatchMapRow>;
};

export function removeInventoryIdsFromProductSyncMaps(
    maps: ProductSyncMaps,
    inventoryIds: string[],
) {
    const removeSet = new Set(inventoryIds);
    for (const inventoryId of removeSet) {
        const batches = maps.batchesByInventoryId.get(inventoryId) || [];
        for (const batch of batches) {
            maps.batchesById.delete(batch.id);
        }
        maps.batchesByInventoryId.delete(inventoryId);
    }

    for (const [drugId, inventories] of maps.inventoriesByDrugId) {
        const remaining = inventories.filter((inventory) => !removeSet.has(inventory.id));
        if (remaining.length > 0) {
            maps.inventoriesByDrugId.set(drugId, remaining);
        } else {
            maps.inventoriesByDrugId.delete(drugId);
        }
    }
}

export function setDrugInventoriesInProductSyncMaps(
    maps: Pick<ProductSyncMaps, 'inventoriesByDrugId'>,
    drugId: string,
    inventories: ProductSyncInventoryMapRow[],
) {
    if (inventories.length > 0) {
        maps.inventoriesByDrugId.set(drugId, inventories);
    } else {
        maps.inventoriesByDrugId.delete(drugId);
    }
}

export function upsertBatchInProductSyncMaps(
    maps: Pick<ProductSyncMaps, 'batchesByInventoryId' | 'batchesById'>,
    batch: ProductSyncBatchMapRow,
) {
    const previous = maps.batchesById.get(batch.id);
    if (previous && previous.inventoryId !== batch.inventoryId) {
        const previousInventoryBatches = maps.batchesByInventoryId.get(previous.inventoryId) || [];
        const remaining = previousInventoryBatches.filter((row) => row.id !== batch.id);
        if (remaining.length > 0) {
            maps.batchesByInventoryId.set(previous.inventoryId, remaining);
        } else {
            maps.batchesByInventoryId.delete(previous.inventoryId);
        }
    }

    const targetBatches = maps.batchesByInventoryId.get(batch.inventoryId) || [];
    const existingIndex = targetBatches.findIndex((row) => row.id === batch.id);
    if (existingIndex >= 0) {
        targetBatches[existingIndex] = batch;
    } else {
        targetBatches.push(batch);
    }
    maps.batchesByInventoryId.set(batch.inventoryId, targetBatches);
    maps.batchesById.set(batch.id, batch);
}
