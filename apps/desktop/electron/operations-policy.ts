/** Tight IPC allowlist: the renderer supplies neither hosts nor credentials. */
export function allowedOperation(path: string, method: string): boolean {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("..") ||
    path.includes("#")
  )
    return false;
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (
    [...params.keys()].some(
      (key) =>
        !["branchId", "search", "page", "match", "type", "id"].includes(key),
    )
  )
    return false;
  if (
    method === "GET" &&
    /^\/warehouses\/orders(?:\/[a-zA-Z0-9-]+(?:\/returns)?)?$/.test(route)
  )
    return true;
  if (method === "GET")
    return /^\/(purchases(?:\/[a-zA-Z0-9-]+)?|inventory\/(stocktake(?:\/[a-zA-Z0-9-]+)?|transfers|operation-batches))$/.test(
      route,
    );
  if (method === "POST")
    return (
      route === "/inventory/stocktake" ||
      route === "/inventory/transfers" ||
      /^\/warehouses\/orders\/[a-zA-Z0-9-]+\/returns$/.test(route) ||
      /^\/purchases\/[a-zA-Z0-9-]+\/receive$/.test(route)
    );
  return (
    method === "PUT" &&
    (/^\/inventory\/stocktake\/[a-zA-Z0-9-]+$/.test(route) ||
      /^\/inventory\/transfers\/[a-zA-Z0-9-]+\/receive$/.test(route))
  );
}

/** Separate receipt and return delegation from purchase creation. */
export function allowedSupplyOperation(route: string, method: string, permissions: Record<string, boolean>): boolean {
  const warehouse = route.startsWith('/warehouses/');
  if (!(warehouse ? permissions.canViewWarehouseOrders : permissions.canViewSuppliers)) return false;
  if (method === 'GET') return true;
  if (method !== 'POST') return false;
  if (/^\/warehouses\/orders\/[^/]+\/returns$/.test(route)) return permissions.canReturnWarehouseOrder === true;
  if (/^\/purchases\/[^/]+\/receive$/.test(route)) return permissions.canReceivePurchase === true;
  return false;
}
