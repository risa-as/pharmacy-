import { describe, expect, it } from 'vitest';

import { getProductSnapshotChanges } from './productSyncDiff';

const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    drugName: 'Drug',
    tradeName: 'Trade',
    scientificName: 'Scientific',
    quantity: 4,
    price: 10,
    reorderLevel: 2,
    branchId: 'b1',
    barcode: '111',
    ...overrides,
});

describe('product snapshot diff', () => {
    it('returns no writes when the local products already match the snapshot', () => {
        expect(getProductSnapshotChanges([row()], [row()])).toEqual({
            upserts: [],
            deleteIds: [],
        });
    });

    it('upserts new and changed rows without rewriting unchanged rows', () => {
        const changes = getProductSnapshotChanges(
            [row(), row({ id: 'p2', quantity: 8 }), row({ id: 'p3' })],
            [row(), row({ id: 'p2', quantity: 2 })],
        );

        expect(changes).toEqual({
            upserts: [row({ id: 'p2', quantity: 8 }), row({ id: 'p3' })],
            deleteIds: [],
        });
    });

    it('deletes rows missing from the authoritative snapshot, including empty snapshots', () => {
        expect(getProductSnapshotChanges([], [row(), row({ id: 'p2' })])).toEqual({
            upserts: [],
            deleteIds: ['p1', 'p2'],
        });
    });

    it('rejects malformed snapshots instead of inventing a fallback id', () => {
        expect(() => getProductSnapshotChanges([row({ id: '' })], [row()])).toThrow('Product snapshot row is missing a valid id');
        expect(() => getProductSnapshotChanges({} as any, [row()])).toThrow('Product snapshot must be an array');
    });
});
