import {expect,it} from 'vitest';
import {allowedOperation} from '../operations-policy';
it.each([['/inventory/stocktake','POST'],['/inventory/stocktake/abc-123','PUT'],['/purchases/a-1/receive','POST'],['/inventory/operation-batches?search=123&page=1','GET']])('allows supported operation %s %s',(path,method)=>expect(allowedOperation(path,method)).toBe(true));
it.each([['https://evil.test/purchases','GET'],['//evil.test/purchases','GET'],['/purchases/../admin','GET'],['/purchases/%2e%2e','GET'],['/inventory/stocktake','DELETE'],['/purchases/a-1','PUT'],['/purchases?redirect=https://evil.test','GET'],['/admin/users','GET']])('rejects arbitrary route %s %s',(path,method)=>expect(allowedOperation(path,method)).toBe(false));

it.each([['/inventory/transfers?type=incoming','GET'],['/inventory/transfers','POST'],['/inventory/transfers/t/receive','PUT'],['/warehouses/orders?page=2','GET'],['/warehouses/orders/o/returns','POST']])('allows employee supply route %s',(path,method)=>expect(allowedOperation(path,method)).toBe(true));
it.each([['/warehouses/orders/o','POST'],['/warehouses/orders/o/reconciliation','POST'],['/warehouses/orders/o/returns','PATCH'],['/inventory/transfers/t/receive','DELETE']])('rejects manager or unsupported command %s',(path,method)=>expect(allowedOperation(path,method)).toBe(false));
