import { describe, expect, it } from 'vitest';
import { rankDrugCandidates, matchesDrugStrength } from '../assistant-drug-candidates';
const catalog=[{id:'lip',tradeName:'Lipitor 20',scientificName:'Atorvastatin 20mg'},{id:'ven',tradeName:'Ventolin Inhaler',scientificName:'Salbutamol'},{id:'p500',tradeName:'Panadol 500',scientificName:'Paracetamol 500mg'},{id:'p250',tradeName:'Panadol 250',scientificName:'Paracetamol 250mg'},{id:'unrelated',tradeName:'Lorazepam 1',scientificName:'Lorazepam'}];
describe('catalog-only multilingual candidate retrieval',()=>{
    it.each([['ليبيتور','lip'],['فنتولين','ven'],['Lipitorr','lip']])('retrieves %s from existing names', (query,id)=>expect(rankDrugCandidates(query,catalog)[0]?.id).toBe(id));
    it('does not fabricate an English name or pick an unrelated drug',()=>{
        expect(rankDrugCandidates('اسم غير موجود إطلاقا',catalog)).toEqual([]);
        expect(rankDrugCandidates('ليبيتور',catalog).map(d=>d.id)).not.toContain('unrelated');
    });
    it('rejects contradictory strengths and never guesses an unknown barcode',()=>{
        expect(rankDrugCandidates('ليبيتور ٢٠ ملغ',catalog)[0]?.id).toBe('lip');
        expect(rankDrugCandidates('ليبيتور 20mg',catalog)[0]?.id).toBe('lip');
        expect(rankDrugCandidates('ليبيتور 40',catalog)).toEqual([]);
        expect(matchesDrugStrength('Panadol 500',catalog[3])).toBe(false);
        expect(matchesDrugStrength('١٢٣٤٥٦٧٨٩',{...catalog[0],barcode:'١٢٣٤٥٦٧٨٩'})).toBe(true);
        expect(rankDrugCandidates('123456789',catalog)).toEqual([]);
    });
});
