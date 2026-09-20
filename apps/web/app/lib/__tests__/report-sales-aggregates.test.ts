import { describe, expect, it } from "vitest";
import {
  buildEmployeeDailySalesQuery,
  buildSaleTenantBranchCondition,
  buildSalesByLocalDateQuery,
} from "../report-sales-aggregates";

function sqlText(query: { text?: string; sql?: string }): string {
  return query.text ?? query.sql ?? "";
}

describe("report sales aggregate SQL builders", () => {
  it("intersects cashier scope with a requested branch", () => {
    const query = buildSaleTenantBranchCondition(
      { branchId: "cashier-branch" },
      "requested-branch",
    );

    expect(sqlText(query)).toContain('s."branchId" = $1 AND s."branchId" = $2');
    expect(query.values).toEqual(["cashier-branch", "requested-branch"]);
  });

  it("keeps organization scope while applying a requested branch", () => {
    const query = buildSaleTenantBranchCondition(
      { branch: { organizationId: "org-1" } },
      "branch-2",
    );

    expect(sqlText(query)).toContain('br."organizationId" = $1 AND s."branchId" = $2');
    expect(query.values).toEqual(["org-1", "branch-2"]);
  });

  it("fails closed for unknown tenant scope shapes", () => {
    const query = buildEmployeeDailySalesQuery({
      tenantBranchWhere: { branchId: { in: ["b1", "b2"] } },
      userId: "user-1",
      start: new Date("2026-09-01T00:00:00.000Z"),
      timeZone: "UTC",
    });

    expect(sqlText(query)).toContain("WHERE FALSE");
    expect(query.values).toEqual(["UTC", new Date("2026-09-01T00:00:00.000Z"), "user-1"]);
  });

  it("buckets employee sales by the requested calendar timezone in SQL", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const query = buildEmployeeDailySalesQuery({
      tenantBranchWhere: { branch: { organizationId: "org-1" } },
      userId: "user-1",
      start,
      timeZone: "Asia/Baghdad",
    });

    const text = sqlText(query);
    expect(text).toContain(`to_char((s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $1, 'YYYY-MM-DD')`);
    expect(text).toContain("GROUP BY 1");
    expect(text).toContain("ORDER BY 1 ASC");
    expect(query.values).toEqual(["Asia/Baghdad", "org-1", start, "user-1"]);
  });

  it("uses UTC-to-local bucketing for midnight boundaries", () => {
    const query = buildSalesByLocalDateQuery({
      tenantBranchWhere: {},
      start: new Date("2026-09-01T00:00:00.000Z"),
      timeZone: "Asia/Baghdad",
    });

    expect(sqlText(query)).toContain(`(s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $1`);
    expect(query.values[0]).toBe("Asia/Baghdad");
    // A sale stored as UTC wall time 2026-09-01 21:30 belongs to
    // 2026-09-02 in Baghdad. Interpreting it directly as Baghdad local time
    // would incorrectly keep it on 2026-09-01.
    expect(sqlText(query)).not.toContain(`s."createdAt" AT TIME ZONE 'Asia/Baghdad'`);
  });
});
