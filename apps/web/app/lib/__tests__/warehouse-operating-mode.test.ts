import {expect,it} from 'vitest';
import {validatePortalShipment} from '../warehouse-operating-mode';
const lot={drugId:'d',batchNumber:'B1',expiryDate:'2099-01-01',quantity:5};
it('accepts several real batches with exact combined shipped quantity including bonus',()=>{expect(validatePortalShipment([lot,{...lot,batchNumber:'B2',quantity:2}],[{drugId:'d',quantity:7}])).toHaveLength(2)});
it.each([0,-1,1.5,8])('rejects invalid or mismatching quantities %s',quantity=>{expect(()=>validatePortalShipment([{...lot,quantity}],[{drugId:'d',quantity:5}])).toThrow()});
it.each([{batchNumber:''},{expiryDate:'2020-01-01'},{expiryDate:'2099-02-31'},{drugId:'foreign'}])('rejects invalid lot %j',patch=>{expect(()=>validatePortalShipment([{...lot,...patch}],[{drugId:'d',quantity:5}])).toThrow()});
it('rejects missing and duplicated batches',()=>{expect(()=>validatePortalShipment([],[{drugId:'d',quantity:5}])).toThrow();expect(()=>validatePortalShipment([lot,lot],[{drugId:'d',quantity:10}])).toThrow()});
