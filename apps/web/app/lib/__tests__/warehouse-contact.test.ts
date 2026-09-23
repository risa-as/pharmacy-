import { describe, expect, it } from 'vitest';
import { warehouseContacts } from '../warehouse-contact';
describe('invoice contact fields',()=>{
    it('omits all blank and missing fields',()=>expect(warehouseContacts({salesPhone:' ',followupPhone:null})).toEqual([]));
    it('keeps labels and only the supplied contacts',()=>expect(warehouseContacts({followupPhone:' 07701234567 ',managementPhone:'07801234567'})).toEqual([{label:'المتابعة',number:'07701234567'},{label:'الإدارة',number:'07801234567'}]));
    it('shows only one department when only one number exists',()=>expect(warehouseContacts({salesPhone:'07701234567'})).toEqual([{label:'المبيعات',number:'07701234567'}]));
    it('renders all three departments in order',()=>expect(warehouseContacts({salesPhone:'1',followupPhone:'2',managementPhone:'3'}).map(c=>c.label)).toEqual(['المبيعات','المتابعة','الإدارة']));
});
