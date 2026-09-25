import { describe, expect, it } from 'vitest';
import { saleIdPrefix } from '../sale-ref';
import { localSaleRef, saleLabel } from '../../src/components/pos/pos-utils';

const id = '3f2a9c1b-7d4e-4a10-9b2c-0123456789ab';

describe('local sale reference', () => {
  it('prints 12 hex characters and finds the sale by them', () => {
    expect(localSaleRef(id)).toBe('م-3F2A9C1B7D4E');
    expect(id.startsWith(saleIdPrefix(localSaleRef(id))!)).toBe(true);
  });

  it('accepts the reference typed with or without its prefix or hyphen, and the older 8-character form', () => {
    for (const typed of ['م-3F2A9C1B7D4E', '3f2a9c1b7d4e', '3F2A9C1B-7D4E', '#3f2a9c1b']) {
      expect(id.startsWith(saleIdPrefix(typed)!)).toBe(true);
    }
  });

  it('ignores text that is not a reference, so invoice numbers and names search as before', () => {
    for (const typed of ['1024', 'panadol', 'م-3F2A', '3f2a9c1b7d4e9']) expect(saleIdPrefix(typed)).toBeNull();
  });

  it('shows the cloud number once assigned', () => {
    expect(saleLabel({ id, invoiceNumber: 1024 })).toBe('1024');
    expect(saleLabel({ id, invoiceNumber: null })).toBe('م-3F2A9C1B7D4E');
  });
});
