import {expect,it} from 'vitest';
import {allowedOperation, operationNeedsSync} from '../operations-policy';
import {allowedSupplyOperation} from '../operations-policy';

it.each([['/inventory/stocktake','POST'],['/inventory/stocktake/abc-123','PUT'],['/inventory/stocktake/abc-123','DELETE'],['/inventory/stocktake/abc-123?type=sheet','GET'],['/purchases/a-1/receive','POST'],['/inventory/operation-batches?search=123&page=1','GET']])('allows supported operation %s %s',(path,method)=>expect(allowedOperation(path,method)).toBe(true));
it.each([['https://evil.test/purchases','GET'],['//evil.test/purchases','GET'],['/purchases/../admin','GET'],['/purchases/%2e%2e','GET'],['/inventory/stocktake','DELETE'],['/purchases/a-1','PUT'],['/purchases?redirect=https://evil.test','GET'],['/admin/users','GET']])('rejects arbitrary route %s %s',(path,method)=>expect(allowedOperation(path,method)).toBe(false));

it.each([['/inventory/transfers?type=incoming','GET'],['/inventory/transfers','POST'],['/inventory/transfers/t/receive','PUT']])('allows employee supply route %s',(path,method)=>expect(allowedOperation(path,method)).toBe(true));
it.each([['/warehouses/orders/o','POST'],['/warehouses/orders/o/reconciliation','POST'],['/warehouses/orders/o/returns','PATCH'],['/inventory/transfers/t/receive','DELETE']])('rejects manager or unsupported command %s',(path,method)=>expect(allowedOperation(path,method)).toBe(false));

it.each([
 ['/warehouses/orders','GET'], ['/warehouses/orders?view=returns&page=1','GET'],
 ['/warehouses/orders/o/returns','GET'], ['/warehouses/orders/o/returns','POST'],
])('warehouse order and return routes are removed: %s %s', (path,method)=>{
 expect(allowedOperation(path,method)).toBe(false);
 expect(allowedSupplyOperation(path.split('?')[0],method,{canViewSuppliers:true,canReceivePurchase:true,canViewWarehouseOrders:true,canReturnWarehouseOrder:true})).toBe(false);
});

it('only writes, the batch search and a count sheet need the sync lock', () => {
 expect(operationNeedsSync('/purchases', 'GET')).toBe(false);
 expect(operationNeedsSync('/purchases/p', 'GET')).toBe(false);
 expect(operationNeedsSync('/inventory/stocktake', 'GET')).toBe(false);
 expect(operationNeedsSync('/inventory/stocktake/s1', 'GET')).toBe(false);
 expect(operationNeedsSync('/inventory/stocktake/s1?type=sheet', 'GET')).toBe(true);
 expect(operationNeedsSync('/inventory/operation-batches?page=2', 'GET')).toBe(true);
 expect(operationNeedsSync('/purchases/p/receive', 'POST')).toBe(true);
 expect(operationNeedsSync('/inventory/stocktake/s1', 'PUT')).toBe(true);
});
