import { Prisma } from "@prisma/client";

export const INVENTORY_DASHBOARD_PAGE_SIZE = 50;
const MAX_INVENTORY_DASHBOARD_OFFSET = 2_147_483_647;

export type InventoryStatusFilter = "" | "shortage" | "low" | "good" | "surplus";

export type InventoryPageIdRow = {
  id: string;
  stock: number;
};

export type InventoryCountsRow = {
  total: number;
  shortage: number;
  low: number;
  good: number;
  surplus: number;
};

type BuildInventoryDashboardQueryOptions = {
  page: number;
  query: string;
  status: string;
  tenantBranchWhere: Record<string, any>;
  branchId?: string;
  pageSize?: number;
};

function andSql(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((sql, condition) => Prisma.sql`${sql} AND ${condition}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildTenantBranchCondition(
  tenantBranchWhere: Record<string, any>,
  requestedBranchId?: string,
): Prisma.Sql {
  if (!isPlainObject(tenantBranchWhere)) return Prisma.sql`FALSE`;

  const keys = Object.keys(tenantBranchWhere);
  const conditions: Prisma.Sql[] = [];
  const requested = requestedBranchId;

  if (keys.length === 0) {
    if (requested) conditions.push(Prisma.sql`i."branchId" = ${requested}`);
    return andSql(conditions);
  }

  if (
    keys.length === 1 &&
    typeof tenantBranchWhere.branchId === "string" &&
    tenantBranchWhere.branchId.trim()
  ) {
    conditions.push(Prisma.sql`i."branchId" = ${tenantBranchWhere.branchId}`);
    if (requested) conditions.push(Prisma.sql`i."branchId" = ${requested}`);
    return andSql(conditions);
  }

  const branch = tenantBranchWhere.branch;
  if (
    keys.length === 1 &&
    isPlainObject(branch) &&
    Object.keys(branch).length === 1 &&
    typeof branch.organizationId === "string" &&
    branch.organizationId.trim()
  ) {
    conditions.push(Prisma.sql`br."organizationId" = ${branch.organizationId}`);
    if (requested) conditions.push(Prisma.sql`i."branchId" = ${requested}`);
    return andSql(conditions);
  }

  return Prisma.sql`FALSE`;
}

function buildSearchCondition(query: string): Prisma.Sql {
  if (!query) return Prisma.sql`TRUE`;

  const pattern = `%${query}%`;
  return Prisma.sql`(
    gd."tradeName" ILIKE ${pattern}
    OR gd."scientificName" ILIKE ${pattern}
    OR gd."barcode" LIKE ${pattern}
  )`;
}

function normalizeStatus(status: string): InventoryStatusFilter {
  if (
    status === "shortage" ||
    status === "low" ||
    status === "good" ||
    status === "surplus"
  ) {
    return status;
  }
  return "";
}

function buildStatusWhere(status: string): Prisma.Sql {
  switch (normalizeStatus(status)) {
    case "shortage":
      return Prisma.sql`WHERE "stock" = 0`;
    case "low":
      return Prisma.sql`WHERE "stock" > 0 AND "stock" < "minStock"`;
    case "good":
      return Prisma.sql`WHERE "stock" >= "minStock" AND "stock" <= "maxStock"`;
    case "surplus":
      return Prisma.sql`WHERE "stock" > "maxStock"`;
    default:
      return Prisma.empty;
  }
}

function boundedPageSize(pageSize?: number): number {
  const parsed = Number(pageSize || INVENTORY_DASHBOARD_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return INVENTORY_DASHBOARD_PAGE_SIZE;
  return Math.min(INVENTORY_DASHBOARD_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

export function normalizeInventoryDashboardPage(
  page: number | string | null | undefined,
  pageSize = INVENTORY_DASHBOARD_PAGE_SIZE,
): number {
  const parsed = Number(page);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;

  const size = boundedPageSize(pageSize);
  const maxPage = Math.floor(MAX_INVENTORY_DASHBOARD_OFFSET / size) + 1;
  return Math.min(Math.max(1, Math.floor(parsed)), maxPage);
}

function buildStockRowsCte({
  query,
  tenantBranchWhere,
  branchId,
}: Pick<
  BuildInventoryDashboardQueryOptions,
  "query" | "tenantBranchWhere" | "branchId"
>): Prisma.Sql {
  const where = andSql([
    buildTenantBranchCondition(tenantBranchWhere, branchId),
    buildSearchCondition(query),
  ]);

  return Prisma.sql`
    WITH stock_rows AS (
      SELECT
        i."id",
        i."minStock",
        i."maxStock",
        gd."tradeName",
        COALESCE(SUM(bat."quantity"), 0)::double precision AS "stock"
      FROM "Inventory" i
      JOIN "GlobalDrug" gd ON gd."id" = i."drugId"
      JOIN "Branch" br ON br."id" = i."branchId"
      LEFT JOIN "Batch" bat ON bat."inventoryId" = i."id"
      WHERE ${where}
      GROUP BY i."id", i."minStock", i."maxStock", gd."tradeName"
    )
  `;
}

export function buildInventoryCountsQuery(
  options: Pick<
    BuildInventoryDashboardQueryOptions,
    "query" | "tenantBranchWhere" | "branchId"
  >,
): Prisma.Sql {
  return Prisma.sql`
    ${buildStockRowsCte(options)}
    SELECT
      COUNT(*)::integer AS "total",
      COUNT(*) FILTER (WHERE "stock" = 0)::integer AS "shortage",
      COUNT(*) FILTER (WHERE "stock" > 0 AND "stock" < "minStock")::integer AS "low",
      COUNT(*) FILTER (WHERE "stock" >= "minStock" AND "stock" <= "maxStock")::integer AS "good",
      COUNT(*) FILTER (WHERE "stock" > "maxStock")::integer AS "surplus"
    FROM stock_rows
  `;
}

export function buildInventoryPageIdsQuery(
  options: BuildInventoryDashboardQueryOptions,
): Prisma.Sql {
  const pageSize = boundedPageSize(options.pageSize);
  const offset = (normalizeInventoryDashboardPage(options.page, pageSize) - 1) * pageSize;

  return Prisma.sql`
    ${buildStockRowsCte(options)}
    SELECT "id", "stock"
    FROM stock_rows
    ${buildStatusWhere(options.status)}
    ORDER BY "tradeName" ASC, "id" ASC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
}
