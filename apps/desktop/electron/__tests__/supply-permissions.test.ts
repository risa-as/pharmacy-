import {expect,it} from 'vitest';
import {allowedSupplyOperation} from '../operations-policy';
const base={canViewSuppliers:true,canViewWarehouseOrders:true,canCreatePurchase:true,canReceivePurchase:false,canReturnWarehouseOrder:false};
it('ordinary creation never authorizes receiving or returning',()=>{expect(allowedSupplyOperation('/purchases/p/receive','POST',base)).toBe(false);expect(allowedSupplyOperation('/warehouses/orders/o/returns','POST',base)).toBe(false)});
it('supports receipt-only without purchase creation',()=>{const p={...base,canCreatePurchase:false,canReceivePurchase:true};expect(allowedSupplyOperation('/purchases/p/receive','POST',p)).toBe(true);expect(allowedSupplyOperation('/warehouses/orders/o/returns','POST',p)).toBe(false)});
it('supports return-only without receipt',()=>{const p={...base,canCreatePurchase:false,canReturnWarehouseOrder:true};expect(allowedSupplyOperation('/warehouses/orders/o/returns','POST',p)).toBe(true);expect(allowedSupplyOperation('/purchases/p/receive','POST',p)).toBe(false)});
it('requires warehouse viewing even with a return grant',()=>{expect(allowedSupplyOperation('/warehouses/orders/o/returns','POST',{...base,canViewWarehouseOrders:false,canReturnWarehouseOrder:true})).toBe(false)});
it('read-only grants cannot mutate and arbitrary endpoints fail closed',()=>{expect(allowedSupplyOperation('/warehouses/orders','GET',base)).toBe(true);expect(allowedSupplyOperation('/warehouses/orders/o','POST',base)).toBe(false);expect(allowedSupplyOperation('/purchases/p/receive','DELETE',{...base,canReceivePurchase:true})).toBe(false)});
