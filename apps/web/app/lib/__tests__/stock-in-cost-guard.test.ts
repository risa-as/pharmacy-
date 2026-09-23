import {beforeEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({db:{$transaction:vi.fn()},auth:vi.fn(),scope:vi.fn()}));
vi.mock('@/app/lib/prisma',()=>({prisma:h.db}));
vi.mock('@/app/lib/sync-auth',()=>({validateSyncUser:h.auth,isBranchInSyncScope:h.scope}));
vi.mock('@/app/lib/audit',()=>({logAudit:vi.fn(),resolveUserName:vi.fn()}));
vi.mock('@/app/lib/notifications/notificationTriggers',()=>({sendAndPersistNotification:vi.fn()}));
import {POST as batch} from '../../api/inventory/add-batch/route';
import {POST as add} from '../../api/inventory/add-to-branch/route';
import {POST as create} from '../../api/inventory/create-quick/route';
beforeEach(()=>{vi.clearAllMocks();h.auth.mockResolvedValue({id:'device',role:'DEVICE',branchId:'b'});h.scope.mockResolvedValue(true);});
for(const [name,handler] of [['batch',batch],['add',add],['create',create]] as const){
 it.each([0,'0','',null,undefined,-1,'abc','12abc','Infinity',1000000001,true,[25],{}])(`${name} rejects invalid cost %s before writes`,async(cost)=>{const response=await handler(new Request('http://local/api',{method:'POST',body:JSON.stringify({inventoryId:'i',drugId:'d',branchId:'b',barcode:'123',tradeName:'Drug',quantity:3,cost,costPrice:cost,expiryDate:'2030-01-01',isBonus:true,confirmedZeroCost:true})}));expect(response.status).toBe(400);expect(h.db.$transaction).not.toHaveBeenCalled();});
}
