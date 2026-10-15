import { describe, expect, it, vi } from 'vitest';
import { inventoryEntryBranch, inventoryBarcodeDestination, resolveInventoryEntryBranch } from './inventory-entry';

describe('inventory entry destination', () => {
    it('requires an explicit branch when a manager views all branches', () => {
        expect(inventoryEntryBranch(true, null, 'assigned')).toBeNull();
        expect(inventoryEntryBranch(true, 'selected', 'assigned')).toBe('selected');
    });
    it('uses the employee assigned branch, regardless of the UI filter', () => {
        expect(inventoryEntryBranch(false, null, 'assigned')).toBe('assigned');
        expect(inventoryEntryBranch(false, 'other', 'assigned')).toBe('assigned');
        expect(inventoryEntryBranch(false, null, null)).toBeNull();
    });
    it('opens creation only after a successful not-found check', () => {
        expect(inventoryBarcodeDestination({ success: true, exists: false })).toBe('create');
        for (const result of [{ success: false }, { success: false, exists: false }, {}, { success: true }, { success: true, exists: true }]) {
            expect(inventoryBarcodeDestination(result)).toBe('blocked');
        }
    });
    it('routes an existing drug to its batch or branch form', () => {
        expect(inventoryBarcodeDestination({ success: true, exists: true, inventory: { id: 'i' }, drug: { id: 'd' } })).toBe('batch');
        expect(inventoryBarcodeDestination({ success: true, exists: true, drug: { id: 'd' } })).toBe('branch');
    });
});

describe('inventory scanner branch initialization', () => {
    it('waits for the single branch after the scanner recreates an unselected screen', async () => {
        let finish!: (branches: Array<{ id: string }>) => void;
        const query = new Promise<Array<{ id: string }>>(resolve => { finish = resolve; });
        const lookup = vi.fn(() => query);
        const checkBarcode = vi.fn();
        const scan = resolveInventoryEntryBranch(true, null, 'assigned', lookup).then(branchId => checkBarcode('123', branchId));
        await Promise.resolve();
        expect(checkBarcode).not.toHaveBeenCalled();
        finish([{ id: 'main' }]);
        await scan;
        expect(checkBarcode).toHaveBeenCalledExactlyOnceWith('123', 'main');
    });
    it('does not guess a destination for a multi-branch manager', async () => {
        expect(await resolveInventoryEntryBranch(true, null, 'main', async () => [{ id: 'main' }, { id: 'second' }])).toBeNull();
    });
    it('keeps an explicit selection and the employee assigned branch without another query', async () => {
        const lookup = vi.fn();
        expect(await resolveInventoryEntryBranch(true, 'second', 'main', lookup)).toBe('second');
        expect(await resolveInventoryEntryBranch(false, null, 'main', lookup)).toBe('main');
        expect(lookup).not.toHaveBeenCalled();
    });
    it('does not overwrite a selection made while the branch list was arriving', async () => {
        expect(await resolveInventoryEntryBranch(true, null, 'main', async () => [{ id: 'main' }, { id: 'second' }], () => 'second')).toBe('second');
    });
    it('blocks an empty/failed list instead of asking for an unavailable choice', async () => {
        await expect(resolveInventoryEntryBranch(true, null, 'main', async () => [])).rejects.toThrow('تعذر تحميل الفروع');
        await expect(resolveInventoryEntryBranch(true, null, 'main', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    });
});
