import {it,expect} from 'vitest';
import {routePermission} from './route-access';
it.each([['/stocktakes','canDoStocktake'],['/transfers','canTransferStock'],['/warehouse-orders','canViewWarehouseOrders'],['/purchases/p1/receive','canReceivePurchase'],['/reports/financial','canViewProfitReport'],['/(tabs)/sales','canSell']])('guards direct route %s', (path,permission)=>expect(routePermission(path)).toBe(permission));
