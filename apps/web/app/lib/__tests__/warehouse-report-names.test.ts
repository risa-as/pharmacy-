import { expect, it } from 'vitest';
import { marginByItem, topSellers, type SoldLine } from '../warehouse-reports';
it('keeps the drug name when a legacy credit has only its barcode', () => {
 const sale:SoldLine={barcode:'123',tradeName:'Medicine',quantity:3,lineTotal:300,costTotal:150,organizationId:'org',shippedAt:'2026-09-01'};
 const credit:SoldLine={...sale,tradeName:'123',quantity:-1,lineTotal:-100,costTotal:0,isReturn:true};
 expect(marginByItem([sale,credit])[0]).toMatchObject({tradeName:'Medicine',revenue:200,cost:150});
 expect(topSellers([sale,credit],'value')[0]).toMatchObject({tradeName:'Medicine',total:200});
});
