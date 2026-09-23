import {expect,it} from 'vitest';
import {prependOperationBatches} from './operation-batch-selection';
it('puts new batches ahead of existing counted batches without changing their quantities or notes',()=>{
 const counted={batch:{id:'old',quantity:10},systemQuantity:10,actual:'0',reason:'checked',reasonCode:'DAMAGE'};
 const previous={old:counted};
 const result=prependOperationBatches(previous,[{id:'new-a',quantity:8},{id:'new-b',quantity:12}]);
 expect(Object.keys(result)).toEqual(['new-a','new-b','old']);expect(result.old).toBe(counted);
 expect(result['new-a'].actual).toBe('');expect(result['new-b'].systemQuantity).toBe(12);
 expect(Object.keys(previous)).toEqual(['old']);
});
it('reselecting a batch never resets an entered count and duplicate selections create one line',()=>{
 const counted={batch:{id:'old'},systemQuantity:10,actual:'3',reason:'note'};
 const result=prependOperationBatches({old:counted},[{id:'old',quantity:99},{id:'new',quantity:5},{id:'new',quantity:5}]);
 expect(Object.keys(result)).toEqual(['new','old']);expect(result.old).toBe(counted);
});
