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

/**
 * Requests that must first sync unsent local sales/stock with the cloud: every
 * write, the batch search and a stocktake count sheet. Only these run one at a
 * time; a plain read (lists, a document) never waits for another page's request.
 */
export function operationNeedsSync(path: string, method: string): boolean {
  const route = String(path || "").split("?")[0];
  return (
    method !== "GET" ||
    String(path || "").startsWith("/inventory/operation-batches") ||
    (/^\/inventory\/stocktake\/[a-zA-Z0-9-]+$/.test(route) &&
      new URLSearchParams(String(path || "").split("?")[1] || "").get("type") === "sheet")
  );
}
