import {beforeEach,it,expect,vi} from "vitest";
const h=vi.hoisted(()=>({handlers:new Map<string,any>()}));
vi.mock("electron",()=>({ipcMain:{handle:(name:string,fn:any)=>h.handlers.set(name,fn)}}));
import {registerStaffHistory} from "../staff-history";
let db:any,authorize:any,assertCurrent:any;
beforeEach(()=>{h.handlers.clear();assertCurrent=vi.fn();authorize=vi.fn().mockResolvedValue({who:{branch:"branch"},access:{permissions:{canProcessReturn:false}},assertCurrent});db={syncFailure:{findMany:vi.fn().mockResolvedValue([])},sale:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(64),aggregate:vi.fn().mockResolvedValue({_sum:{total:521500}})},$transaction:vi.fn((calls:any)=>Promise.all(calls))};registerStaffHistory(db,authorize);});
const call=(input:any={})=>h.handlers.get("staff:sales")(null,input);
it('scopes list, count and amount to identical branch and date filters',async()=>{
 const result=await call({branchId:"foreign",page:2,from:"2026-09-01T00:00:00Z",to:"2026-09-22T23:59:59Z",search:"١٢"});
 expect(result).toMatchObject({success:true,total:64,amount:521500,canReturn:false});
 const query=db.sale.findMany.mock.calls[0][0];expect(query.where.user.branchId).toBe("branch");expect(query.skip).toBe(30);expect(query.where.OR[0].invoiceNumber.contains).toBe("12");
 expect(db.sale.count.mock.calls[0][0].where).toEqual(query.where);expect(db.sale.aggregate.mock.calls[0][0].where).toEqual(query.where);
});
it('does not read data when current permission is denied',async()=>{authorize.mockRejectedValue(Error("denied"));expect((await call()).success).toBe(false);expect(db.sale.findMany).not.toHaveBeenCalled();});
it('does not disclose results after a user change',async()=>{assertCurrent.mockImplementation(()=>{throw Error("changed")});expect((await call()).success).toBe(false);});
it('rejects invalid and reversed date ranges',async()=>{expect((await call({from:"not-a-date"})).success).toBe(false);expect((await call({from:"2026-10-01",to:"2026-09-01"})).success).toBe(false);expect(db.sale.findMany).not.toHaveBeenCalled();});

it('marks a failed upload even when the old sync loop marked it synced',async()=>{db.sale.findMany.mockResolvedValue([{id:'s',synced:true}]);db.syncFailure.findMany.mockResolvedValue([{entityId:'s'}]);expect((await call()).sales[0].syncFailed).toBe(true);});
