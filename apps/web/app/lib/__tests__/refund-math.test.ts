import { expect, it } from 'vitest';
import { calculateRefund } from '@faramace/shared';
it('allocates discount and rounding across repeated partial refunds exactly', () => {
 const sale = { total: 10, items: [{ drugId: 'a', quantity: 3, price: 4 }], returns: [] as any[] };
 const totals = [];
 for (let i=0;i<3;i++) { const refund = calculateRefund(sale,[{drugId:'a',quantity:1}]); totals.push(refund.total); sale.returns.push(refund); }
 expect(totals).toEqual([3.33,3.34,3.33]);
 expect(() => calculateRefund(sale,[{drugId:'a',quantity:1}])).toThrow();
});
it('never refunds more than remaining paid amount after legacy over-refund', () => {
 expect(calculateRefund({total:100,items:[{drugId:'a',quantity:2,price:100}],returns:[{total:90,items:[{drugId:'a',quantity:1}]}]},[{drugId:'a',quantity:1}]).total).toBe(10);
});
it('supports free items without a false positive refund', () => {
 expect(calculateRefund({total:80,items:[{drugId:'a',quantity:1,price:100},{drugId:'b',quantity:1,price:0}]},[{drugId:'b',quantity:1}]).total).toBe(0);
});
