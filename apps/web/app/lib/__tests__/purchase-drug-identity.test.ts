import { describe, it, expect } from 'vitest';
import { resolvePurchaseIdentity, type PurchaseDrugIdentity } from '../purchase-drug-identity';
const global: PurchaseDrugIdentity = {id:'g',barcode:'123',tradeName:'Drug 100mg',scientificName:'compound',organizationId:null};
const local = {...global,id:'l',organizationId:'org'};
describe('purchase identity', () => {
 it('shares local and global history only after an unambiguous match', () => {
   expect(resolvePurchaseIdentity(local,[local,global])).toMatchObject({ids:['l','g'],globalDrugId:'g'});
 });
 it('does not merge another concentration with the same barcode', () => {
   expect(resolvePurchaseIdentity(local,[local,{...global,tradeName:'Drug 200mg'}])).toMatchObject({ids:['l'],globalDrugId:null,reason:'AMBIGUOUS_BARCODE'});
 });
 it('checks duplicate global barcodes even for an already-global selection', () => {
   expect(resolvePurchaseIdentity(global,[global,{...global,id:'g2'}]).reason).toBe('AMBIGUOUS_BARCODE');
 });
 it('never marks a global drug without a barcode as sendable', () => {
   expect(resolvePurchaseIdentity({...global,barcode:''},[]).reason).toBe('NO_BARCODE');
 });
});
