import { describe, expect, it } from 'vitest';
import { warehouseInboxQuery } from '../warehouse-order-query';

describe('warehouse inbox query', () => {
    it('review dashboard includes both new and in-review orders and preserves the limit', () => {
        expect(warehouseInboxQuery('REVIEW','20')).toEqual({status:{in:['SENT','UNDER_REVIEW']},take:20});
        expect(()=>warehouseInboxQuery('REVIEW','101')).toThrow();
    });
    it('always hides pharmacy drafts', () => {
        expect(warehouseInboxQuery().status).toEqual({ not: 'DRAFT' });
        expect(() => warehouseInboxQuery('DRAFT')).toThrow();
    });
    it.each(['NaN', '-1', '0', '101', '1.5', 'Infinity'])('rejects invalid page size %s', (take) => {
        expect(() => warehouseInboxQuery(null, take)).toThrow();
    });
    it('rejects arbitrary status and prototype keys', () => {
        expect(() => warehouseInboxQuery('toString')).toThrow();
        expect(() => warehouseInboxQuery('INVALID')).toThrow();
        expect(warehouseInboxQuery('QUOTED', '20')).toEqual({ status: 'QUOTED', take: 20 });
    });
});
