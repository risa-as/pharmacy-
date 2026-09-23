export const routePermission = (path: string): string | null => {
  const p = path.replace("/(tabs)", "");
  if (p.startsWith("/warehouse-orders")) return "canViewWarehouseOrders";
  if (p.startsWith("/stocktakes")) return "canDoStocktake";
  if (p.startsWith("/transfers")) return "canTransferStock";
  if (p.startsWith("/purchases") && p.endsWith("/receive"))
    return "canReceivePurchase";
  if (p.startsWith("/purchases")) return "canViewSuppliers";
  if (p.startsWith("/smart-orders")) return "canViewInventory";
  if (p.startsWith("/sales-history")) return "canViewSales";
  if (p.startsWith("/sales")) return "canSell";
  if (p.startsWith("/inventory")) return "canViewInventory";
  if (p.startsWith("/reports/financial")) return "canViewProfitReport";
  if (p.startsWith("/reports/employees")) return "canViewEmployeeReport";
  if (p.startsWith("/reports")) return "canViewReports";
  if (p.startsWith("/accounting/expenses")) return "canViewExpenses";
  if (p.startsWith("/crm/add")) return "canEditPatient";
  if (p.startsWith("/crm")) return "canViewPatients";
  if (p.startsWith("/debts")) return "canViewDebts";
  return null;
};
