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
  if (method === "GET")
    return /^\/(purchases(?:\/[a-zA-Z0-9-]+)?|inventory\/(stocktake(?:\/[a-zA-Z0-9-]+)?|transfers|operation-batches))$/.test(
      route,
    );
  if (method === "POST")
    return (
      route === "/inventory/stocktake" ||
      route === "/inventory/transfers" ||
      /^\/purchases\/[a-zA-Z0-9-]+\/receive$/.test(route)
    );
  // Deleting a stocktake draft (the server only cancels a PENDING one).
  if (method === "DELETE")
    return /^\/inventory\/stocktake\/[a-zA-Z0-9-]+$/.test(route);
  return (
    method === "PUT" &&
    (/^\/inventory\/stocktake\/[a-zA-Z0-9-]+$/.test(route) ||
      /^\/inventory\/transfers\/[a-zA-Z0-9-]+\/receive$/.test(route))
  );
}

/** Desktop supply operations are limited to purchase receiving. */
export function allowedSupplyOperation(route: string, method: string, permissions: Record<string, boolean>): boolean {
  if (!permissions.canViewSuppliers) return false;
  if (method === 'GET') return /^\/purchases(?:\/[a-zA-Z0-9-]+)?$/.test(route);
  return method === 'POST' && /^\/purchases\/[a-zA-Z0-9-]+\/receive$/.test(route) && permissions.canReceivePurchase === true;
}
