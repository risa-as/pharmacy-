import { describe, expect, it } from 'vitest';
import { marginByItem, slowMovers, type SoldLine } from '../warehouse-reports';
import { readWarehousePages } from '../warehouse-pagination';
const line: SoldLine = { barcode:'X',tradeName:'Medicine',quantity:1,lineTotal:100,organizationId:'org',shippedAt:'2026-09-01T00:00:00Z' };
describe('warehouse financial reporting regression',()=>{
    it('marks mixed known/unknown historical costs incomplete',()=>{
        expect(marginByItem([{...line,costTotal:40},line])[0]).toMatchObject({costComplete:false,marginPercent:null});
    });
    it('distinguishes known zero cost on a credit from missing cost',()=>{
        expect(marginByItem([{...line,isReturn:true,quantity:-1,lineTotal:-100,costTotal:0}])[0]).toMatchObject({costComplete:true,cost:0,margin:-100,marginPercent:null});
    });
    it('a recent return does not make an old item fast-moving',()=>{
        const result=slowMovers([{barcode:'X',tradeName:'Medicine'}],[line,{...line,isReturn:true,shippedAt:'2026-09-21T00:00:00Z'}],10,new Date('2026-09-21T12:00:00Z'));
        expect(result).toHaveLength(1);expect(result[0].daysSince).toBe(20);
    });
    it('fails instead of looping forever if a report cursor does not advance',async()=>{
        await expect(readWarehousePages(async()=>Array.from({length:500},()=>({id:'stuck'})))).rejects.toThrow('did not advance');
    });
});
