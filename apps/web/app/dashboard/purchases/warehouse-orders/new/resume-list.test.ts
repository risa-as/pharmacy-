import { describe, expect, it } from 'vitest';
import { buildOrderPayload, buildSendGroups, type SendGroupPlan } from '@/app/lib/warehouse-order-grouping';
import { resumeUnsentLines, storedListIsEmpty } from './resume-list';
import { selectedOption, type NeedLine } from './types';

function group(status: SendGroupPlan['status'], drugId = 'd1'): SendGroupPlan {
    return {
        warehouseId: 'w1', warehouseName: 'Warehouse', supplierNames: ['Supplier'],
        status, idempotencyKey: 'original-key',
        lines: [{ drugId, barcode: drugId, tradeName: 'Drug', quantity: 7,
            warehouseId: 'w1', warehouseName: 'Warehouse', supplierName: 'Supplier', unitPrice: 500 }],
    };
}

describe('resume unsent needs', () => {
    it('keeps failed and manual items, excluding successful orders after reload', () => {
        const manual = resumeUnsentLines([group('FAILED', 'manual')], [], [])[0];
        const result = resumeUnsentLines([group('SENT', 'sent'), group('FAILED')], [manual], []);
        expect(result.map(l => l.drugId)).toEqual(['d1', 'manual']);
        expect(result[0].quantity).toBe(7);
        expect(result[0].comparison).toBeNull();
        expect(result[0].unitConfirmed).toBe(false);
        expect(result[0].manualWarehouseId).toBe('w1');
        expect(selectedOption(result[0])).toBeNull();
    });

    it.each(['UNKNOWN', 'SENDING'] as const)('refuses to reset a %s request', status => {
        expect(() => resumeUnsentLines([group(status)], [], [])).toThrow();
    });

    it('retains uncertainty even if a status is incorrectly marked failed', () => {
        expect(() => resumeUnsentLines([{ ...group('FAILED'), hasUncertainOutcome: true }], [], [])).toThrow();
    });

    it('preserves original identity and selection while reloading comparison', () => {
        const original: NeedLine = { ...resumeUnsentLines([group('FAILED')], [], [])[0],
            globalDrugId: 'global-drug', unitConfirmed: true, selectedSupplierId: 'supplier',
            manuallyChosen: true, chosenPriceAtSelection: 500, manualWarehouseId: null };
        const [draft] = resumeUnsentLines([group('FAILED')], [], [original]);
        expect(draft).toMatchObject({ globalDrugId: 'global-drug', quantity: 7, selectedSupplierId: 'supplier', comparison: null });
        const rebuilt = buildSendGroups([{ ...group('FAILED').lines[0], quantity: 3 }], () => 'new-key');
        expect(buildOrderPayload(rebuilt[0], 'branch', 'edited note')).toMatchObject({
            idempotencyKey: 'new-key', notes: 'edited note', items: [{ barcode: 'd1', quantity: 3, unitPrice: 500 }],
        });
    });
});

describe('importing the next smart-purchasing draft (OPEN-14)', () => {
    it('an empty stored list ("بدء قائمة جديدة" after a full send) may be replaced', () => {
        expect(storedListIsEmpty(null)).toBe(true);
        expect(storedListIsEmpty(JSON.stringify({ version: 2, groups: [], blocked: [], draft: [], notes: {}, originalLines: [] }))).toBe(true);
        expect(storedListIsEmpty(JSON.stringify({ version: 2, purchaseDraftId: undefined, groups: [], blocked: [] }))).toBe(true);
    });
    it('anything that could be lost keeps the refusal: groups of any status, blocked or draft lines, unknown records', () => {
        for (const status of ['SENT', 'PENDING', 'SENDING', 'FAILED', 'UNKNOWN'] as const)
            expect(storedListIsEmpty(JSON.stringify({ version: 2, groups: [group(status)], blocked: [] }))).toBe(false);
        expect(storedListIsEmpty(JSON.stringify({ version: 2, groups: [], blocked: [{ drugId: 'd' }] }))).toBe(false);
        expect(storedListIsEmpty(JSON.stringify({ version: 2, groups: [], blocked: [], draft: [{ drugId: 'd' }] }))).toBe(false);
        expect(storedListIsEmpty(JSON.stringify({ version: 1, groups: [], blocked: [] }))).toBe(false);
        expect(storedListIsEmpty(JSON.stringify({ version: 2, blocked: [] }))).toBe(false);
        expect(storedListIsEmpty('{not json')).toBe(false);
    });
});
