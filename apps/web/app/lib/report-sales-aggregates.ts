import { Prisma } from "@prisma/client";

function andSql(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((sql, condition) => Prisma.sql`${sql} AND ${condition}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildSaleTenantBranchCondition(
  tenantBranchWhere: Record<string, any>,
  requestedBranchId?: string,
): Prisma.Sql {
  if (!isPlainObject(tenantBranchWhere)) return Prisma.sql`FALSE`;

  const keys = Object.keys(tenantBranchWhere);
  const conditions: Prisma.Sql[] = [];

  if (keys.length === 0) {
    if (requestedBranchId) conditions.push(Prisma.sql`s."branchId" = ${requestedBranchId}`);
    return andSql(conditions);
  }

  if (
    keys.length === 1 &&
    typeof tenantBranchWhere.branchId === "string" &&
    tenantBranchWhere.branchId.trim()
  ) {
    conditions.push(Prisma.sql`s."branchId" = ${tenantBranchWhere.branchId}`);
    if (requestedBranchId) conditions.push(Prisma.sql`s."branchId" = ${requestedBranchId}`);
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
    if (requestedBranchId) conditions.push(Prisma.sql`s."branchId" = ${requestedBranchId}`);
    return andSql(conditions);
  }

  return Prisma.sql`FALSE`;
}

export type EmployeeDailySalesRow = {
  date: string;
  total: number;
};

export type DailySalesRow = {
  date: string;
  total: number;
};

export function buildSalesByLocalDateQuery({
  tenantBranchWhere,
  start,
  timeZone,
  userId,
}: {
  tenantBranchWhere: Record<string, any>;
  start: Date;
  timeZone: string;
  userId?: string;
}): Prisma.Sql {
  const conditions = [
    buildSaleTenantBranchCondition(tenantBranchWhere),
    Prisma.sql`s."createdAt" >= ${start}`,
  ];
  if (userId) conditions.push(Prisma.sql`s."userId" = ${userId}`);

  return Prisma.sql`
    SELECT
      to_char((s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS "date",
      COALESCE(SUM(s."total"), 0)::double precision AS "total"
    FROM "Sale" s
    JOIN "Branch" br ON br."id" = s."branchId"
    WHERE ${andSql(conditions)}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export function buildEmployeeDailySalesQuery({
  tenantBranchWhere,
  userId,
  start,
  timeZone,
}: {
  tenantBranchWhere: Record<string, any>;
  userId: string;
  start: Date;
  timeZone: string;
}): Prisma.Sql {
  return buildSalesByLocalDateQuery({ tenantBranchWhere, userId, start, timeZone });
}
