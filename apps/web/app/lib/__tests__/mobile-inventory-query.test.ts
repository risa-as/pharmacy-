import { describe, expect, it } from 'vitest';
import { buildMobileInventoryQuery } from '../mobile-inventory-query';

describe('mobile inventory pagination', () => {
    it('intersects tenant scope and branch and parameterizes literal search', () => {
        const query = buildMobileInventoryQuery(new URLSearchParams({
            branchId: 'other', search: "50%_\\'", sort: 'quantity; DROP TABLE Inventory', direction: 'desc;--',
        }), { branchId: 'own' }, new Date('2026-09-20T12:00:00Z'));
        expect(query.values).toContain('own');
        expect(query.values).toContain('other');
        expect(query.values).toContain("%50\\%\\_\\\\'%");
        expect(query.text).not.toContain('DROP TABLE');
        expect(query.text).toContain('ORDER BY "tradeName" ASC, id ASC');
        expect(query.values.slice(-2)).toEqual([50, 0]);
    });

    it('caps invalid pages and fails closed for unknown scopes', () => {
        const query = buildMobileInventoryQuery(new URLSearchParams({ page: 'Infinity' }), { branchId: { in: ['a'] } });
        expect(query.text).toContain('WHERE FALSE');
        expect(query.values.slice(-2)).toEqual([50, 0]);
    });

    it.each([
        ['low-stock', 'quantity > 0 AND quantity <= "minStock"'],
        ['out', 'quantity <= 0'],
        ['near-expiry', 'days >= 0 AND days < 120'],
        ['expired', 'days < 0'],
    ])('preserves mobile %s boundaries', (status, condition) => {
        const query = buildMobileInventoryQuery(new URLSearchParams({ status, page: '2', sort: 'expiry', direction: 'desc' }), {});
        expect(query.text).toContain(`AND (${condition})`);
        expect(query.text).toContain('COALESCE(days, 9999) DESC, id ASC');
        expect(query.values.slice(-2)).toEqual([50, 50]);
    });
});
